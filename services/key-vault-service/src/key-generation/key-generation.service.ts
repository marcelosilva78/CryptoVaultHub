import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';

export interface DerivedKeyInfo {
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
   *
   * SECURITY NOTE (V8 string immutability limitation):
   * The `mnemonic` phrase and `masterNode.privateKey` / `childNode.privateKey` are
   * ethers.js strings. JavaScript strings are immutable and interned in V8's heap —
   * they cannot be zeroed or overwritten. The private key Buffers derived from
   * `childNode.privateKey` ARE zeroable (and we do zero them after encryption).
   * For the mnemonic and HDNodeWallet objects, we null all references as early as
   * possible to drop strong refs and allow V8's GC to reclaim the memory sooner.
   * A future improvement would use a native C++ BIP-32/39 library that operates
   * entirely on Buffers, avoiding string conversion for mnemonics and derived keys.
   */
  async generateClientKeys(
    clientId: number,
    requestedBy: string,
  ): Promise<DerivedKeyInfo[]> {
    // Ensure master seed exists (outside transaction to avoid long locks)
    const masterSeed = await this.getOrCreateMasterSeed();

    // Decrypt master mnemonic (pass stored kdfIterations to handle seeds
    // encrypted under a different iteration count than the current config)
    let mnemonic: string | null = this.encryption.decryptToString(
      {
        ciphertext: masterSeed.encryptedSeed,
        iv: masterSeed.iv,
        authTag: masterSeed.authTag,
        salt: masterSeed.salt,
        encryptedDek: masterSeed.encryptedDek,
      },
      masterSeed.kdfIterations,
    );

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    let masterNode: ethers.HDNodeWallet | null =
      ethers.HDNodeWallet.fromMnemonic(mnemonicObj);

    // Drop mnemonic string reference immediately — no longer needed after
    // deriving masterNode. This doesn't zero V8's interned copy but removes
    // the strong reference so GC can collect it sooner.
    mnemonic = null;

    const keyTypes: Array<'platform' | 'client' | 'backup'> = [
      'platform',
      'client',
      'backup',
    ];

    // Wrap check + create in a Prisma transaction for atomicity
    const results = await this.prisma.$transaction(async (tx) => {
      // Check if client already has keys (inside transaction to prevent race)
      const existing = await tx.derivedKey.findFirst({
        where: { clientId: BigInt(clientId) },
      });
      if (existing) {
        throw new ConflictException(
          `Client ${clientId} already has derived keys`,
        );
      }

      const txResults: DerivedKeyInfo[] = [];

      for (let i = 0; i < keyTypes.length; i++) {
        const keyType = keyTypes[i];
        const pathIndex = clientId * 3 + i;
        const derivationPath = `m/44'/60'/${pathIndex}'/0/0`;

        const childNode = masterNode!.derivePath(derivationPath);
        const privateKeyBuf = Buffer.from(
          childNode.privateKey.slice(2),
          'hex',
        );

        // Envelope-encrypt the private key
        const encrypted = this.encryption.encrypt(privateKeyBuf);

        // Zero the private key buffer (this IS effective — Buffer is backed by ArrayBuffer)
        privateKeyBuf.fill(0);

        await tx.derivedKey.create({
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

        txResults.push({
          publicKey: childNode.publicKey,
          address: childNode.address,
          derivationPath,
          keyType,
        });
      }

      return txResults;
    });

    // Drop masterNode reference — it holds derived keys as V8 strings internally.
    // Nulling removes the strong reference so GC can collect the entire HDNodeWallet
    // object graph sooner.
    masterNode = null;

    // Audit logs outside the transaction (non-critical, shouldn't block key creation)
    for (const result of results) {
      await this.audit.log({
        operation: 'key_generated',
        clientId,
        keyType: result.keyType,
        address: result.address,
        requestedBy,
        metadata: { derivationPath: result.derivationPath },
      });
    }

    this.logger.log(
      `Generated ${keyTypes.length} keys for client ${clientId}`,
    );
    return results;
  }

  /**
   * Derive a gas tank key for a specific client and chain.
   * Path: m/44'/60'/1000'/chainId/clientIndex
   *
   * See SECURITY NOTE in generateClientKeys regarding V8 string immutability.
   */
  async deriveGasTankKey(
    clientId: number,
    chainId: number,
    requestedBy: string,
  ): Promise<DerivedKeyInfo> {
    const masterSeed = await this.getMasterSeed();
    let mnemonic: string | null = this.encryption.decryptToString(
      {
        ciphertext: masterSeed.encryptedSeed,
        iv: masterSeed.iv,
        authTag: masterSeed.authTag,
        salt: masterSeed.salt,
        encryptedDek: masterSeed.encryptedDek,
      },
      masterSeed.kdfIterations,
    );

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    let masterNode: ethers.HDNodeWallet | null =
      ethers.HDNodeWallet.fromMnemonic(mnemonicObj);

    // Drop mnemonic string reference immediately (JS strings are immutable in V8;
    // we cannot zero them, but nulling removes the strong ref to aid GC)
    mnemonic = null;

    const derivationPath = `m/44'/60'/1000'/${chainId}/${clientId}`;
    const childNode = masterNode.derivePath(derivationPath);

    // Drop masterNode reference — no longer needed after deriving childNode
    masterNode = null;

    const privateKeyBuf = Buffer.from(
      childNode.privateKey.slice(2),
      'hex',
    );

    const encrypted = this.encryption.encrypt(privateKeyBuf);
    // Zero the private key buffer (this IS effective — Buffer is backed by ArrayBuffer)
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

  /**
   * Decrypt a chain-scoped private key (e.g. gas_tank for a specific chain).
   * CALLER IS RESPONSIBLE FOR ZEROING THE RETURNED BUFFER.
   */
  async decryptPrivateKeyForChain(
    clientId: number,
    keyType: string,
    chainId: number,
  ): Promise<{ privateKey: Buffer; address: string; keyId: bigint }> {
    const chainScope = `evm:${chainId}`;
    const key = await this.prisma.derivedKey.findUnique({
      where: {
        uq_client_keytype_chain: {
          clientId: BigInt(clientId),
          keyType: keyType as any,
          chainScope,
        },
      },
    });

    if (!key || !key.isActive) {
      throw new NotFoundException(
        `Active ${keyType} key not found for client ${clientId}, chain ${chainId}`,
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
        kdfIterations: this.encryption.kdfIterations,
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
