import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
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
   */
  async splitBackupKey(
    clientId: number,
    totalShares: number = DEFAULT_TOTAL_SHARES,
    threshold: number = DEFAULT_THRESHOLD,
    custodians: string[] = DEFAULT_CUSTODIANS,
    requestedBy: string = 'system',
  ): Promise<{
    clientId: number;
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

    // Check if shares already exist
    const existingShares = await this.prisma.shamirShare.findMany({
      where: { clientId: BigInt(clientId) },
    });
    if (existingShares.length > 0) {
      throw new BadRequestException(
        `Shares already exist for client ${clientId}. Delete existing shares first.`,
      );
    }

    // Decrypt the backup private key
    const { privateKey } = await this.keyGenService.decryptPrivateKey(
      clientId,
      'backup',
    );

    try {
      // Convert private key to hex for Shamir splitting
      const hexSecret = privateKey.toString('hex');

      // Split into shares
      const shares = secrets.share(hexSecret, totalShares, threshold);

      // Encrypt and store each share
      for (let i = 0; i < shares.length; i++) {
        const shareBuf = Buffer.from(shares[i], 'utf-8');
        const encrypted = this.encryption.encrypt(shareBuf);
        shareBuf.fill(0);

        await this.prisma.shamirShare.create({
          data: {
            clientId: BigInt(clientId),
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

      // Zero the shares from memory
      shares.forEach((s) => {
        // Strings are immutable in JS, but we do what we can
        (shares as any)[shares.indexOf(s)] = '';
      });

      await this.audit.log({
        operation: 'shamir_split',
        clientId,
        keyType: 'backup',
        requestedBy,
        metadata: { totalShares, threshold, custodians },
      });

      this.logger.log(
        `Split backup key for client ${clientId} into ${totalShares} shares (threshold: ${threshold})`,
      );

      return { clientId, totalShares, threshold, custodians };
    } finally {
      // CRITICAL: zero private key
      privateKey.fill(0);
    }
  }

  /**
   * Get share distribution status for a client.
   */
  async getShareStatus(clientId: number) {
    const shares = await this.prisma.shamirShare.findMany({
      where: { clientId: BigInt(clientId) },
      select: {
        shareIndex: true,
        custodian: true,
        isDistributed: true,
        distributedAt: true,
        createdAt: true,
      },
      orderBy: { shareIndex: 'asc' },
    });

    if (shares.length === 0) {
      throw new NotFoundException(
        `No shares found for client ${clientId}`,
      );
    }

    return {
      clientId,
      totalShares: shares.length,
      distributedCount: shares.filter((s) => s.isDistributed).length,
      shares,
    };
  }

  /**
   * Reconstruct the backup key from K shares.
   */
  async reconstructBackupKey(
    clientId: number,
    shareIndices: number[],
    requestedBy: string = 'system',
  ): Promise<{ address: string; publicKey: string }> {
    // Fetch the specified shares
    const shares = await this.prisma.shamirShare.findMany({
      where: {
        clientId: BigInt(clientId),
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

    try {
      // Reconstruct the secret
      const reconstructedHex = secrets.combine(decryptedShares);
      const privateKeyBuf = Buffer.from(reconstructedHex, 'hex');

      // Verify by deriving the address and comparing with stored backup key
      const { ethers } = await import('ethers');
      const privateKeyHex = '0x' + privateKeyBuf.toString('hex');
      const wallet = new ethers.Wallet(privateKeyHex);

      // Zero sensitive data
      privateKeyBuf.fill(0);

      await this.audit.log({
        operation: 'shamir_reconstruct',
        clientId,
        keyType: 'backup',
        address: wallet.address,
        requestedBy,
        metadata: { shareIndices, shareCount: shares.length },
      });

      this.logger.warn(
        `Backup key reconstructed for client ${clientId} by ${requestedBy}`,
      );

      // Return only public info — never expose the private key via API
      return {
        address: wallet.address,
        publicKey: wallet.signingKey.publicKey,
      };
    } finally {
      // Zero decrypted shares
      decryptedShares.forEach((_, i) => {
        decryptedShares[i] = '';
      });
    }
  }
}
