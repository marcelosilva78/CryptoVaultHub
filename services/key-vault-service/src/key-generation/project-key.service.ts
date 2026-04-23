import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ShamirService } from '../shamir/shamir.service';
import { AuditService } from '../audit/audit.service';
import { DerivedKeyInfo } from './key-generation.service';

@Injectable()
export class ProjectKeyService {
  private readonly logger = new Logger(ProjectKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly shamirService: ShamirService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Generate a project-scoped BIP-39 seed.
   * The mnemonic phrase is returned ONCE — the client must save it.
   * It is never stored in plaintext and cannot be retrieved again.
   *
   * SECURITY NOTE (V8 string immutability limitation):
   * The mnemonic phrase is an ethers.js string. JavaScript strings are immutable
   * and interned in V8's heap — they cannot be zeroed or overwritten. We null
   * all references as early as possible to drop strong refs and allow V8's GC to
   * reclaim the memory sooner. A future improvement would use a native C++ BIP-39
   * library that operates entirely on Buffers.
   */
  async generateProjectSeed(
    projectId: number,
    requestedBy: string,
  ): Promise<{ mnemonic: string; projectId: number }> {
    // L-1: Cross-DB FK validation — verify project exists in cvh_admin
    const projectExists = await this.prisma.$queryRaw<any[]>`
      SELECT 1 FROM cvh_admin.projects WHERE id = ${BigInt(projectId)} LIMIT 1
    `;
    if (!projectExists?.length) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Check if seed already exists for this project
    const existing = await this.prisma.projectSeed.findUnique({
      where: { projectId: BigInt(projectId) },
    });
    if (existing) {
      throw new ConflictException(
        `Project ${projectId} already has a seed`,
      );
    }

    // Generate BIP-39 mnemonic (256 bits = 24 words)
    const entropy = ethers.randomBytes(32);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
    const phrase = mnemonic.phrase;

    // Encrypt the mnemonic phrase with envelope encryption
    const encrypted = this.encryption.encryptString(phrase);

    await this.prisma.projectSeed.create({
      data: {
        projectId: BigInt(projectId),
        encryptedSeed: encrypted.ciphertext,
        encryptedDek: encrypted.encryptedDek,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        salt: encrypted.salt,
        kdfIterations: this.encryption.kdfIterations,
      },
    });

    await this.audit.log({
      operation: 'project_seed_created',
      requestedBy,
      metadata: { projectId },
    });

    this.logger.log(`Generated project seed for project ${projectId}`);

    // Return the mnemonic phrase — this is the ONLY time it's returned
    return { mnemonic: phrase, projectId };
  }

  /**
   * Generate 3 derived keys for a project: platform/client/backup.
   * In client_only custody mode, the roles map to clientKey1/clientKey2/backup.
   *
   * SECURITY NOTE (V8 string immutability limitation):
   * See generateProjectSeed for details on V8 string handling.
   * The private key Buffers derived from childNode.privateKey ARE zeroable
   * (and we do zero them after encryption). For the mnemonic and HDNodeWallet
   * objects, we null all references as early as possible.
   */
  async generateProjectKeys(
    projectId: number,
    clientId: number,
    custodyMode: string,
    requestedBy: string,
  ): Promise<DerivedKeyInfo[]> {
    // Load project seed
    const projectSeed = await this.prisma.projectSeed.findUnique({
      where: { projectId: BigInt(projectId) },
    });
    if (!projectSeed) {
      throw new NotFoundException(
        `No seed found for project ${projectId}. Generate a project seed first.`,
      );
    }

    // Decrypt mnemonic (pass stored kdfIterations to handle seeds
    // encrypted under a different iteration count than the current config)
    let mnemonic: string | null = this.encryption.decryptToString(
      {
        ciphertext: projectSeed.encryptedSeed,
        iv: projectSeed.iv,
        authTag: projectSeed.authTag,
        salt: projectSeed.salt,
        encryptedDek: projectSeed.encryptedDek,
      },
      projectSeed.kdfIterations,
    );

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    // Derive from seed to get BIP-32 root node (depth 0) for m/ path derivation
    const seed = mnemonicObj.computeSeed();
    let masterNode: ethers.HDNodeWallet | null =
      ethers.HDNodeWallet.fromSeed(seed);

    // Drop mnemonic string reference immediately — no longer needed after
    // deriving masterNode. This doesn't zero V8's interned copy but removes
    // the strong reference so GC can collect it sooner.
    mnemonic = null;

    // Custody mode semantics:
    // - full_custody: platform key by CVH, client key also by CVH (auto-sign both)
    // - co_sign: platform key by CVH, client key by client (needs co-sign)
    // - client_only: both keys by client
    //
    // M-3: co_sign mode generates the same 3 derived keys as full_custody.
    // The difference is purely operational: in co_sign mode, the withdrawal
    // and sweep services check the project's custodyMode and require an
    // external co-signature from the client key holder before executing
    // on-chain transactions. Key generation is intentionally identical —
    // all 3 keys (platform, client, backup) are derived from the project
    // seed regardless of custody mode.

    const keyDefs: Array<{
      keyType: 'platform' | 'client' | 'backup';
      path: string;
    }> = [
      {
        keyType: 'platform',
        path: `m/44'/60'/0'/0/0`,
      },
      {
        keyType: 'client',
        path: `m/44'/60'/1'/0/0`,
      },
      {
        keyType: 'backup',
        path: `m/44'/60'/2'/0/0`,
      },
    ];

    // Wrap check + create in a Prisma transaction for atomicity
    const results = await this.prisma.$transaction(async (tx) => {
      // Check if project already has keys (inside transaction to prevent race)
      const existing = await tx.derivedKey.findFirst({
        where: { projectId: BigInt(projectId) },
      });
      if (existing) {
        throw new ConflictException(
          `Project ${projectId} already has derived keys`,
        );
      }

      const txResults: DerivedKeyInfo[] = [];

      for (const def of keyDefs) {
        const childNode = masterNode!.derivePath(def.path);
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
            projectId: BigInt(projectId),
            keyType: def.keyType,
            chainScope: 'evm',
            publicKey: childNode.publicKey,
            address: childNode.address,
            derivationPath: def.path,
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
          derivationPath: def.path,
          keyType: def.keyType,
        });
      }

      return txResults;
    });

    // Drop masterNode reference — it holds derived keys as V8 strings internally.
    // Nulling removes the strong reference so GC can collect the entire HDNodeWallet
    // object graph sooner.
    masterNode = null;

    // Apply Shamir 3-of-5 splitting to the project's backup key.
    // H-1/L-4: Use project-scoped Shamir so each project gets its own share set.
    await this.shamirService.splitBackupKey(
      clientId,
      projectId,
      undefined,
      undefined,
      undefined,
      requestedBy,
    );

    // Mark Shamir split done on the project seed
    await this.prisma.projectSeed.update({
      where: { projectId: BigInt(projectId) },
      data: { shamirSplitDone: true },
    });

    // Audit logs outside the transaction (non-critical, shouldn't block key creation)
    for (const result of results) {
      await this.audit.log({
        operation: 'project_key_generated',
        clientId,
        keyType: result.keyType,
        address: result.address,
        requestedBy,
        metadata: {
          projectId,
          derivationPath: result.derivationPath,
          custodyMode,
        },
      });
    }

    this.logger.log(
      `Generated ${keyDefs.length} keys for project ${projectId}, client ${clientId}`,
    );
    return results;
  }

  /**
   * Derive a gas tank key for a specific project and chain.
   * Path: m/44'/60'/1000'/chainId/0
   *
   * Uses the project seed (not master seed) — each project has its own
   * gas tank key per chain, deterministically derived.
   *
   * See SECURITY NOTE in generateProjectKeys regarding V8 string immutability.
   */
  async deriveProjectGasTankKey(
    projectId: number,
    clientId: number,
    chainId: number,
    requestedBy: string,
  ): Promise<DerivedKeyInfo> {
    // Load project seed
    const projectSeed = await this.prisma.projectSeed.findUnique({
      where: { projectId: BigInt(projectId) },
    });
    if (!projectSeed) {
      throw new NotFoundException(
        `No seed found for project ${projectId}. Generate a project seed first.`,
      );
    }

    // Check if gas_tank key already exists for this project + chain
    const existing = await this.prisma.derivedKey.findFirst({
      where: {
        projectId: BigInt(projectId),
        keyType: 'gas_tank',
        chainScope: `evm:${chainId}`,
      },
    });
    if (existing) {
      // Return existing key info instead of creating duplicate
      return {
        publicKey: existing.publicKey,
        address: existing.address,
        derivationPath: existing.derivationPath,
        keyType: 'gas_tank',
      };
    }

    // Decrypt mnemonic
    let mnemonic: string | null = this.encryption.decryptToString(
      {
        ciphertext: projectSeed.encryptedSeed,
        iv: projectSeed.iv,
        authTag: projectSeed.authTag,
        salt: projectSeed.salt,
        encryptedDek: projectSeed.encryptedDek,
      },
      projectSeed.kdfIterations,
    );

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const seed = mnemonicObj.computeSeed();
    let masterNode: ethers.HDNodeWallet | null =
      ethers.HDNodeWallet.fromSeed(seed);

    // Drop mnemonic string reference immediately
    mnemonic = null;

    const derivationPath = `m/44'/60'/1000'/${chainId}/0`;
    const childNode = masterNode.derivePath(derivationPath);

    // Drop masterNode reference
    masterNode = null;

    const privateKeyBuf = Buffer.from(
      childNode.privateKey.slice(2),
      'hex',
    );

    const encrypted = this.encryption.encrypt(privateKeyBuf);
    // Zero the private key buffer
    privateKeyBuf.fill(0);

    await this.prisma.derivedKey.create({
      data: {
        clientId: BigInt(clientId),
        projectId: BigInt(projectId),
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
      operation: 'project_gas_tank_key_derived',
      clientId,
      keyType: 'gas_tank',
      address: childNode.address,
      chainId,
      requestedBy,
      metadata: { projectId, derivationPath },
    });

    this.logger.log(
      `Derived gas tank key for project ${projectId}, chain ${chainId}: ${childNode.address}`,
    );

    return {
      publicKey: childNode.publicKey,
      address: childNode.address,
      derivationPath,
      keyType: 'gas_tank',
    };
  }

  /**
   * Mark the project seed as shown to the client.
   * This is a one-way flag — once set, it cannot be unset.
   */
  async markSeedShown(
    projectId: number,
  ): Promise<{ projectId: number; seedShownToClient: boolean }> {
    const projectSeed = await this.prisma.projectSeed.findUnique({
      where: { projectId: BigInt(projectId) },
    });
    if (!projectSeed) {
      throw new NotFoundException(
        `No seed found for project ${projectId}`,
      );
    }

    await this.prisma.projectSeed.update({
      where: { projectId: BigInt(projectId) },
      data: { seedShownToClient: true },
    });

    return { projectId, seedShownToClient: true };
  }

  /**
   * Get public keys and addresses for a project (no private data).
   */
  async getProjectPublicKeys(
    projectId: number,
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
      where: {
        projectId: BigInt(projectId),
        isActive: true,
      },
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
        `No keys found for project ${projectId}`,
      );
    }

    return keys;
  }

  /**
   * Decrypt a project-scoped private key for signing. Returns the private key Buffer.
   * CALLER IS RESPONSIBLE FOR ZEROING THE RETURNED BUFFER.
   */
  async decryptProjectKey(
    projectId: number,
    keyType: string,
  ): Promise<{ privateKey: Buffer; address: string; keyId: bigint }> {
    const key = await this.prisma.derivedKey.findFirst({
      where: {
        projectId: BigInt(projectId),
        keyType: keyType as any,
        isActive: true,
      },
    });

    if (!key) {
      throw new NotFoundException(
        `Active ${keyType} key not found for project ${projectId}`,
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
}
