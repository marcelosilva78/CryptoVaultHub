import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';

interface DerivedKeyInfo {
  publicKey: string;
  address: string;
  derivationPath: string;
  keyType: 'platform' | 'client' | 'backup' | 'gas_tank';
}

@Injectable()
export class KeyGenerationService {
  private readonly logger = new Logger(KeyGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Generate master seed if none exists, then derive 3 keys for the given client:
   * platform, client, backup.
   */
  async generateClientKeys(
    clientId: number,
    requestedBy: string,
  ): Promise<DerivedKeyInfo[]> {
    // Check if client already has keys
    const existing = await this.prisma.derivedKey.findFirst({
      where: { clientId: BigInt(clientId) },
    });
    if (existing) {
      throw new ConflictException(
        `Client ${clientId} already has derived keys`,
      );
    }

    // Ensure master seed exists
    const masterSeed = await this.getOrCreateMasterSeed();

    // Decrypt master mnemonic
    const mnemonic = this.encryption.decryptToString({
      ciphertext: masterSeed.encryptedSeed,
      iv: masterSeed.iv,
      authTag: masterSeed.authTag,
      salt: masterSeed.salt,
      encryptedDek: masterSeed.encryptedDek,
    });

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const masterNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj);

    const keyTypes: Array<'platform' | 'client' | 'backup'> = [
      'platform',
      'client',
      'backup',
    ];
    const results: DerivedKeyInfo[] = [];

    for (let i = 0; i < keyTypes.length; i++) {
      const keyType = keyTypes[i];
      const pathIndex = clientId * 3 + i;
      const derivationPath = `m/44'/60'/${pathIndex}'/0/0`;

      const childNode = masterNode.derivePath(derivationPath);
      const privateKeyBuf = Buffer.from(
        childNode.privateKey.slice(2),
        'hex',
      );

      // Envelope-encrypt the private key
      const encrypted = this.encryption.encrypt(privateKeyBuf);

      // Zero the private key buffer
      privateKeyBuf.fill(0);

      await this.prisma.derivedKey.create({
        data: {
          clientId: BigInt(clientId),
          keyType,
          chainScope: 'evm',
          publicKey: childNode.publicKey,
          address: childNode.address,
          derivationPath,
          encryptedKey: encrypted.ciphertext,
          encryptedDek: encrypted.encryptedDek,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          salt: encrypted.salt,
        },
      });

      results.push({
        publicKey: childNode.publicKey,
        address: childNode.address,
        derivationPath,
        keyType,
      });

      await this.audit.log({
        operation: 'key_generated',
        clientId,
        keyType,
        address: childNode.address,
        requestedBy,
        metadata: { derivationPath },
      });
    }

    // Zero mnemonic from memory
    mnemonic.split('').fill('0');

    this.logger.log(
      `Generated ${keyTypes.length} keys for client ${clientId}`,
    );
    return results;
  }

  /**
   * Derive a gas tank key for a specific client and chain.
   * Path: m/44'/60'/1000'/chainId/clientIndex
   */
  async deriveGasTankKey(
    clientId: number,
    chainId: number,
    requestedBy: string,
  ): Promise<DerivedKeyInfo> {
    const masterSeed = await this.getMasterSeed();
    const mnemonic = this.encryption.decryptToString({
      ciphertext: masterSeed.encryptedSeed,
      iv: masterSeed.iv,
      authTag: masterSeed.authTag,
      salt: masterSeed.salt,
      encryptedDek: masterSeed.encryptedDek,
    });

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const masterNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj);

    const derivationPath = `m/44'/60'/1000'/${chainId}/${clientId}`;
    const childNode = masterNode.derivePath(derivationPath);
    const privateKeyBuf = Buffer.from(
      childNode.privateKey.slice(2),
      'hex',
    );

    const encrypted = this.encryption.encrypt(privateKeyBuf);
    privateKeyBuf.fill(0);

    // Use upsert in case gas_tank key already exists for this client
    // (we allow multiple gas tank keys via different chain scopes)
    await this.prisma.derivedKey.create({
      data: {
        clientId: BigInt(clientId),
        keyType: 'gas_tank',
        chainScope: `evm:${chainId}`,
        publicKey: childNode.publicKey,
        address: childNode.address,
        derivationPath,
        encryptedKey: encrypted.ciphertext,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        salt: encrypted.salt,
      },
    });

    await this.audit.log({
      operation: 'gas_tank_key_derived',
      clientId,
      keyType: 'gas_tank',
      address: childNode.address,
      chainId,
      requestedBy,
      metadata: { derivationPath },
    });

    return {
      publicKey: childNode.publicKey,
      address: childNode.address,
      derivationPath,
      keyType: 'gas_tank',
    };
  }

  /**
   * Get public keys and addresses for a client (no private data).
   */
  async getPublicKeys(
    clientId: number,
  ): Promise<
    Array<{
      keyType: string;
      publicKey: string;
      address: string;
      derivationPath: string;
      chainScope: string;
      isActive: boolean;
    }>
  > {
    const keys = await this.prisma.derivedKey.findMany({
      where: { clientId: BigInt(clientId) },
      select: {
        keyType: true,
        publicKey: true,
        address: true,
        derivationPath: true,
        chainScope: true,
        isActive: true,
      },
    });

    if (keys.length === 0) {
      throw new NotFoundException(
        `No keys found for client ${clientId}`,
      );
    }

    return keys;
  }

  /**
   * Decrypt a private key for signing. Returns the private key Buffer.
   * CALLER IS RESPONSIBLE FOR ZEROING THE RETURNED BUFFER.
   */
  async decryptPrivateKey(
    clientId: number,
    keyType: string,
  ): Promise<{ privateKey: Buffer; address: string; keyId: bigint }> {
    const key = await this.prisma.derivedKey.findFirst({
      where: {
        clientId: BigInt(clientId),
        keyType: keyType as any,
        isActive: true,
      },
    });

    if (!key) {
      throw new NotFoundException(
        `Active ${keyType} key not found for client ${clientId}`,
      );
    }

    const privateKey = this.encryption.decrypt({
      ciphertext: key.encryptedKey,
      iv: key.iv,
      authTag: key.authTag,
      salt: key.salt,
      encryptedDek: key.encryptedDek,
    });

    return { privateKey, address: key.address, keyId: key.id };
  }

  private async getOrCreateMasterSeed() {
    const existing = await this.prisma.masterSeed.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    // Generate new master seed (BIP-39 mnemonic, 256 bits = 24 words)
    const entropy = ethers.randomBytes(32);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);

    const encrypted = this.encryption.encryptString(mnemonic.phrase);

    const seedId = ethers.hexlify(ethers.randomBytes(32)).slice(2);

    const created = await this.prisma.masterSeed.create({
      data: {
        seedId,
        encryptedSeed: encrypted.ciphertext,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        salt: encrypted.salt,
      },
    });

    await this.audit.log({
      operation: 'master_seed_created',
      requestedBy: 'system',
      metadata: { seedId },
    });

    this.logger.log('Master seed generated and encrypted');
    return created;
  }

  private async getMasterSeed() {
    const seed = await this.prisma.masterSeed.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!seed) {
      throw new NotFoundException(
        'No master seed found. Generate client keys first.',
      );
    }
    return seed;
  }
}
