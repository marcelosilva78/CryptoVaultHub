import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as secrets from 'secrets.js-grempe';
import { PrismaService } from '../prisma/prisma.service';
import { KeyGenerationService } from '../key-generation/key-generation.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditService } from '../audit/audit.service';

const DEFAULT_TOTAL_SHARES = 5;
const DEFAULT_THRESHOLD = 3;
const DEFAULT_CUSTODIANS = [
  'company_vault',
  'ceo_safe',
  'cto_safe',
  'legal_escrow',
  'bank_safe_deposit',
];

@Injectable()
export class ShamirService {
  private readonly logger = new Logger(ShamirService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyGenService: KeyGenerationService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {
    // Initialize secrets.js with 8-bit chunks for compatibility
    secrets.init(8, 'nodeCryptoRandomBytes');
  }

  /**
   * Split a client's backup key into Shamir shares.
   *
   * L-4/H-1: Accepts an optional projectId. When provided, shares are scoped
   * to the project so each project gets its own independent share set.
   * For legacy (pre-project) keys, projectId may be omitted.
   */
  async splitBackupKey(
    clientId: number,
    projectId?: number,
    totalShares: number = DEFAULT_TOTAL_SHARES,
    threshold: number = DEFAULT_THRESHOLD,
    custodians: string[] = DEFAULT_CUSTODIANS,
    requestedBy: string = 'system',
  ): Promise<{
    clientId: number;
    projectId?: number;
    totalShares: number;
    threshold: number;
    custodians: string[];
  }> {
    // I8: Validate that threshold <= totalShares
    if (threshold > totalShares) {
      throw new BadRequestException(
        `threshold (${threshold}) must be <= totalShares (${totalShares})`,
      );
    }

    if (custodians.length !== totalShares) {
      throw new BadRequestException(
        `Number of custodians (${custodians.length}) must match totalShares (${totalShares})`,
      );
    }

    // Check if shares already exist for this client+project combo
    const existingShares = await this.prisma.shamirShare.findMany({
      where: {
        clientId: BigInt(clientId),
        ...(projectId != null ? { projectId: BigInt(projectId) } : { projectId: null }),
      },
    });
    if (existingShares.length > 0) {
      const scope = projectId != null ? `client ${clientId}, project ${projectId}` : `client ${clientId}`;
      throw new BadRequestException(
        `Shares already exist for ${scope}. Delete existing shares first.`,
      );
    }

    // H-1: When a projectId is provided, decrypt the project-scoped backup key.
    // For legacy (pre-project) clients, fall back to the client-scoped key.
    let privateKey: Buffer;
    if (projectId != null) {
      // Import dynamically to avoid circular dependency at module init time
      const { ProjectKeyService } = await import('../key-generation/project-key.service');
      // The project key service is injected alongside keyGenService.
      // We use a raw query fallback: decrypt the project-scoped backup key.
      const projectKey = await this.prisma.derivedKey.findFirst({
        where: {
          projectId: BigInt(projectId),
          keyType: 'backup',
          isActive: true,
        },
      });
      if (!projectKey) {
        throw new NotFoundException(
          `Active backup key not found for project ${projectId}`,
        );
      }
      privateKey = this.encryption.decrypt({
        ciphertext: projectKey.encryptedKey,
        iv: projectKey.iv,
        authTag: projectKey.authTag,
        salt: projectKey.salt,
        encryptedDek: projectKey.encryptedDek,
      });
    } else {
      const result = await this.keyGenService.decryptPrivateKey(clientId, 'backup');
      privateKey = result.privateKey;
    }

    // SECURITY NOTE (V8 string immutability limitation):
    // The secrets.js-grempe library requires hex string input. JavaScript strings
    // are immutable and interned in V8's heap — they cannot be zeroed or overwritten.
    // This means `hexSecret` will persist in memory until V8's garbage collector
    // reclaims it. We mitigate this by:
    // 1. Scoping the hex string to the smallest possible block
    // 2. Nulling all references immediately after use to enable earlier GC
    // 3. Zeroing the source Buffer (privateKey) in the `finally` block
    // A future improvement would be to use a native C++ addon that operates on
    // Buffers directly for Shamir splitting, avoiding hex string conversion entirely.
    let hexSecret: string | null = null;
    let shares: string[] | null = null;

    try {
      // Convert private key to hex for Shamir splitting — unfortunately required
      // by secrets.js-grempe which only accepts hex string input.
      hexSecret = privateKey.toString('hex');

      // Split into shares (returns hex strings)
      shares = secrets.share(hexSecret, totalShares, threshold);

      // Drop the hex secret reference as early as possible to aid GC
      hexSecret = null;

      // Encrypt and store each share
      for (let i = 0; i < shares.length; i++) {
        const shareBuf = Buffer.from(shares[i], 'utf-8');
        const encrypted = this.encryption.encrypt(shareBuf);
        shareBuf.fill(0);

        // Drop the plaintext share reference immediately after encryption
        shares[i] = '';

        await this.prisma.shamirShare.create({
          data: {
            clientId: BigInt(clientId),
            ...(projectId != null ? { projectId: BigInt(projectId) } : {}),
            shareIndex: i + 1,
            custodian: custodians[i],
            encryptedShare: encrypted.ciphertext,
            encryptedDek: encrypted.encryptedDek,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            salt: encrypted.salt,
          },
        });
      }

      // Null the shares array reference to aid GC
      shares = null;

      await this.audit.log({
        operation: 'shamir_split',
        clientId,
        keyType: 'backup',
        requestedBy,
        metadata: { projectId, totalShares, threshold, custodians },
      });

      const scope = projectId != null
        ? `client ${clientId}, project ${projectId}`
        : `client ${clientId}`;
      this.logger.log(
        `Split backup key for ${scope} into ${totalShares} shares (threshold: ${threshold})`,
      );

      return { clientId, projectId, totalShares, threshold, custodians };
    } finally {
      // CRITICAL: zero private key
      privateKey.fill(0);
    }
  }

  /**
   * Get share distribution status for a client (optionally scoped to a project).
   */
  async getShareStatus(clientId: number, projectId?: number) {
    const shares = await this.prisma.shamirShare.findMany({
      where: {
        clientId: BigInt(clientId),
        ...(projectId != null ? { projectId: BigInt(projectId) } : {}),
      },
      select: {
        projectId: true,
        shareIndex: true,
        custodian: true,
        isDistributed: true,
        distributedAt: true,
        createdAt: true,
      },
      orderBy: { shareIndex: 'asc' },
    });

    if (shares.length === 0) {
      const scope = projectId != null
        ? `client ${clientId}, project ${projectId}`
        : `client ${clientId}`;
      throw new NotFoundException(
        `No shares found for ${scope}`,
      );
    }

    return {
      clientId,
      projectId,
      totalShares: shares.length,
      distributedCount: shares.filter((s) => s.isDistributed).length,
      shares,
    };
  }

  /**
   * Reconstruct the backup key from K shares.
   * L-4: Accepts an optional projectId to reconstruct project-scoped shares.
   */
  async reconstructBackupKey(
    clientId: number,
    shareIndices: number[],
    requestedBy: string = 'system',
    projectId?: number,
  ): Promise<{ address: string; publicKey: string }> {
    // Enforce minimum share threshold to prevent garbage reconstruction
    if (shareIndices.length < DEFAULT_THRESHOLD) {
      throw new BadRequestException(
        `Minimum ${DEFAULT_THRESHOLD} shares required for reconstruction`,
      );
    }

    // Fetch the specified shares (project-scoped when projectId provided)
    const shares = await this.prisma.shamirShare.findMany({
      where: {
        clientId: BigInt(clientId),
        ...(projectId != null ? { projectId: BigInt(projectId) } : { projectId: null }),
        shareIndex: { in: shareIndices },
      },
    });

    if (shares.length < shareIndices.length) {
      throw new NotFoundException(
        `Some shares not found. Requested: ${shareIndices.join(',')}, found: ${shares.length}`,
      );
    }

    // Decrypt each share
    const decryptedShares: string[] = [];
    for (const share of shares) {
      const shareBuf = this.encryption.decrypt({
        ciphertext: share.encryptedShare,
        iv: share.iv,
        authTag: share.authTag,
        salt: share.salt,
        encryptedDek: share.encryptedDek,
      });
      decryptedShares.push(shareBuf.toString('utf-8'));
      shareBuf.fill(0);
    }

    // SECURITY NOTE (V8 string immutability limitation):
    // secrets.combine() returns a hex string and decryptedShares are also strings.
    // These cannot be zeroed in V8. We null all references as early as possible
    // to enable garbage collection and zero the reconstructed Buffer immediately
    // after deriving the public key and address.
    let reconstructedHex: string | null = null;

    try {
      // Reconstruct the secret (returns hex string — V8 limitation, see note above)
      reconstructedHex = secrets.combine(decryptedShares);
      const privateKeyBuf = Buffer.from(reconstructedHex, 'hex');

      // Drop hex string reference immediately
      reconstructedHex = null;

      // Derive public key and address using native secp256k1 — private key
      // stays as Buffer and is NEVER converted to a JS string.
      const secp256k1 = await import('secp256k1');
      const pubKeyUncompressed = Buffer.from(
        secp256k1.publicKeyCreate(Uint8Array.from(privateKeyBuf), false),
      );

      // Zero the private key Buffer as soon as we have the public key
      privateKeyBuf.fill(0);

      // Compute Ethereum address from uncompressed public key:
      // keccak256(pubkey_without_04_prefix)[12..31]
      const { ethers } = await import('ethers');
      const addressHash = ethers.keccak256(pubKeyUncompressed.subarray(1));
      const address = ethers.getAddress('0x' + addressHash.slice(-40));
      const publicKey = '0x' + pubKeyUncompressed.toString('hex');

      // Verify reconstructed key matches stored backup address
      // L-4: Use project-scoped lookup when projectId is provided
      const storedBackupKey = await this.prisma.derivedKey.findFirst({
        where: {
          ...(projectId != null
            ? { projectId: BigInt(projectId) }
            : { clientId: BigInt(clientId) }),
          keyType: 'backup',
          isActive: true,
        },
        select: { address: true },
      });
      if (!storedBackupKey) {
        const scope = projectId != null ? `project ${projectId}` : `client ${clientId}`;
        throw new NotFoundException(
          `No stored backup key found for ${scope}`,
        );
      }
      if (address.toLowerCase() !== storedBackupKey.address.toLowerCase()) {
        throw new InternalServerErrorException(
          'Reconstructed key does not match stored backup address — possible corruption or insufficient shares',
        );
      }

      await this.audit.log({
        operation: 'shamir_reconstruct',
        clientId,
        keyType: 'backup',
        address,
        requestedBy,
        metadata: { projectId, shareIndices, shareCount: shares.length },
      });

      const scope = projectId != null
        ? `client ${clientId}, project ${projectId}`
        : `client ${clientId}`;
      this.logger.warn(
        `Backup key reconstructed for ${scope} by ${requestedBy}`,
      );

      // Return only public info — never expose the private key via API
      return {
        address,
        publicKey,
      };
    } finally {
      // Drop decrypted share references to aid GC (strings are immutable in V8;
      // we cannot zero them, but nulling the references allows earlier collection)
      decryptedShares.forEach((_, i) => {
        decryptedShares[i] = '';
      });
      reconstructedHex = null;
    }
  }
}
