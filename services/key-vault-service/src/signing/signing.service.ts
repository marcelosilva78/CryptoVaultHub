import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { KeyGenerationService } from '../key-generation/key-generation.service';
import { AuditService } from '../audit/audit.service';

export interface SignatureResult {
  signature: string;
  v: number;
  r: string;
  s: string;
  address: string;
}

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyGenService: KeyGenerationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sign a hash with the specified key type for a client.
   * The private key is decrypted in memory, used for signing, then zeroed.
   */
  async signHash(
    clientId: number,
    hash: string,
    keyType: string,
    requestedBy: string,
  ): Promise<SignatureResult> {
    const { privateKey, address, keyId } =
      await this.keyGenService.decryptPrivateKey(clientId, keyType);

    try {
      // Reconstruct private key hex with 0x prefix
      const privateKeyHex = '0x' + privateKey.toString('hex');
      const signingKey = new ethers.SigningKey(privateKeyHex);

      // Sign the hash
      const signature = signingKey.sign(hash);

      // Update usage stats
      await this.prisma.derivedKey.update({
        where: { id: keyId },
        data: {
          lastUsedAt: new Date(),
          signCount: { increment: 1 },
        },
      });

      await this.audit.log({
        operation: 'sign_hash',
        clientId,
        keyType,
        address,
        txHash: hash,
        requestedBy,
      });

      return {
        signature: signature.serialized,
        v: signature.v,
        r: signature.r,
        s: signature.s,
        address,
      };
    } finally {
      // CRITICAL: zero private key from memory
      privateKey.fill(0);
    }
  }

  /**
   * Sign multiple hashes with the same key (batch signing).
   * Key is decrypted once and used for all hashes, then zeroed.
   */
  async signBatch(
    clientId: number,
    hashes: string[],
    keyType: string,
    requestedBy: string,
  ): Promise<SignatureResult[]> {
    const { privateKey, address, keyId } =
      await this.keyGenService.decryptPrivateKey(clientId, keyType);

    try {
      const privateKeyHex = '0x' + privateKey.toString('hex');
      const signingKey = new ethers.SigningKey(privateKeyHex);

      const results: SignatureResult[] = [];

      for (const hash of hashes) {
        const signature = signingKey.sign(hash);
        results.push({
          signature: signature.serialized,
          v: signature.v,
          r: signature.r,
          s: signature.s,
          address,
        });
      }

      // Update usage stats
      await this.prisma.derivedKey.update({
        where: { id: keyId },
        data: {
          lastUsedAt: new Date(),
          signCount: { increment: hashes.length },
        },
      });

      await this.audit.log({
        operation: 'sign_batch',
        clientId,
        keyType,
        address,
        requestedBy,
        metadata: { hashCount: hashes.length },
      });

      return results;
    } finally {
      // CRITICAL: zero private key from memory
      privateKey.fill(0);
    }
  }
}
