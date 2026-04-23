import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EncryptionService, EncryptedPayload } from './encryption.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface RotationResult {
  rotatedSeeds: number;
  rotatedProjectSeeds: number;
  rotatedKeys: number;
  rotatedShares: number;
  errors: string[];
}

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    private readonly encryption: EncryptionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Rotate all encrypted records from oldPassword to newPassword.
   *
   * This re-encrypts every master_seed, project_seed, derived_key, and shamir_share
   * record with the new password. Each record is processed in its own transaction
   * so that a failure on one record does not roll back others.
   *
   * IMPORTANT: After successful rotation, the VAULT_MASTER_PASSWORD environment
   * variable must be updated to the new password before restarting the service.
   */
  async rotateMasterPassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<RotationResult> {
    if (!oldPassword || !newPassword) {
      throw new BadRequestException('Both oldPassword and newPassword are required');
    }
    if (oldPassword === newPassword) {
      throw new BadRequestException('New password must be different from old password');
    }

    const result: RotationResult = {
      rotatedSeeds: 0,
      rotatedProjectSeeds: 0,
      rotatedKeys: 0,
      rotatedShares: 0,
      errors: [],
    };

    // 1. Verify old password works by trying to decrypt one record
    const verificationSeed = await this.prisma.masterSeed.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (verificationSeed) {
      try {
        this.encryption.decryptWithPassword(
          {
            ciphertext: verificationSeed.encryptedSeed,
            iv: verificationSeed.iv,
            authTag: verificationSeed.authTag,
            salt: verificationSeed.salt,
            encryptedDek: verificationSeed.encryptedDek,
          },
          oldPassword,
          verificationSeed.kdfIterations,
        );
      } catch {
        throw new BadRequestException(
          'Old password verification failed — cannot decrypt existing records',
        );
      }
    }

    this.logger.warn('Starting master password rotation');

    // 2. Rotate master_seeds
    const masterSeeds = await this.prisma.masterSeed.findMany();
    for (const seed of masterSeeds) {
      try {
        const rotated = this.encryption.rotateEncryption(
          {
            ciphertext: seed.encryptedSeed,
            iv: seed.iv,
            authTag: seed.authTag,
            salt: seed.salt,
            encryptedDek: seed.encryptedDek,
          },
          oldPassword,
          newPassword,
          (seed as any).keyVersion ?? 1,
          seed.kdfIterations,
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.masterSeed.update({
            where: { id: seed.id },
            data: {
              encryptedSeed: rotated.ciphertext,
              iv: rotated.iv,
              authTag: rotated.authTag,
              salt: rotated.salt,
              encryptedDek: rotated.encryptedDek,
              kdfIterations: this.encryption.kdfIterations,
            },
          });
        });

        // Update key_version via raw query (field may not be in Prisma schema yet)
        await this.prisma.$executeRaw`
          UPDATE master_seeds SET key_version = ${rotated.keyVersion ?? 2} WHERE id = ${seed.id}
        `;

        result.rotatedSeeds++;

        await this.audit.log({
          operation: 'key_rotation',
          requestedBy: 'system',
          metadata: {
            table: 'master_seeds',
            recordId: seed.id.toString(),
            seedId: seed.seedId,
            newKeyVersion: rotated.keyVersion,
          },
        });
      } catch (error: any) {
        const msg = `Failed to rotate master_seed id=${seed.id}: ${error.message}`;
        this.logger.error(msg);
        result.errors.push(msg);
      }
    }

    // 3. Rotate project_seeds
    const projectSeeds = await this.prisma.projectSeed.findMany();
    for (const seed of projectSeeds) {
      try {
        const rotated = this.encryption.rotateEncryption(
          {
            ciphertext: seed.encryptedSeed,
            iv: seed.iv,
            authTag: seed.authTag,
            salt: seed.salt,
            encryptedDek: seed.encryptedDek,
          },
          oldPassword,
          newPassword,
          (seed as any).keyVersion ?? 1,
          seed.kdfIterations,
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.projectSeed.update({
            where: { id: seed.id },
            data: {
              encryptedSeed: rotated.ciphertext,
              iv: rotated.iv,
              authTag: rotated.authTag,
              salt: rotated.salt,
              encryptedDek: rotated.encryptedDek,
              kdfIterations: this.encryption.kdfIterations,
            },
          });
        });

        await this.prisma.$executeRaw`
          UPDATE project_seeds SET key_version = ${rotated.keyVersion ?? 2} WHERE id = ${seed.id}
        `;

        result.rotatedProjectSeeds++;

        await this.audit.log({
          operation: 'key_rotation',
          requestedBy: 'system',
          metadata: {
            table: 'project_seeds',
            recordId: seed.id.toString(),
            projectId: seed.projectId.toString(),
            newKeyVersion: rotated.keyVersion,
          },
        });
      } catch (error: any) {
        const msg = `Failed to rotate project_seed id=${seed.id}: ${error.message}`;
        this.logger.error(msg);
        result.errors.push(msg);
      }
    }

    // 4. Rotate derived_keys
    const derivedKeys = await this.prisma.derivedKey.findMany();
    for (const key of derivedKeys) {
      try {
        const rotated = this.encryption.rotateEncryption(
          {
            ciphertext: key.encryptedKey,
            iv: key.iv,
            authTag: key.authTag,
            salt: key.salt,
            encryptedDek: key.encryptedDek,
          },
          oldPassword,
          newPassword,
          (key as any).keyVersion ?? 1,
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.derivedKey.update({
            where: { id: key.id },
            data: {
              encryptedKey: rotated.ciphertext,
              iv: rotated.iv,
              authTag: rotated.authTag,
              salt: rotated.salt,
              encryptedDek: rotated.encryptedDek,
            },
          });
        });

        await this.prisma.$executeRaw`
          UPDATE derived_keys SET key_version = ${rotated.keyVersion ?? 2} WHERE id = ${key.id}
        `;

        result.rotatedKeys++;

        await this.audit.log({
          operation: 'key_rotation',
          clientId: key.clientId,
          keyType: key.keyType,
          address: key.address,
          requestedBy: 'system',
          metadata: {
            table: 'derived_keys',
            recordId: key.id.toString(),
            newKeyVersion: rotated.keyVersion,
          },
        });
      } catch (error: any) {
        const msg = `Failed to rotate derived_key id=${key.id} (${key.address}): ${error.message}`;
        this.logger.error(msg);
        result.errors.push(msg);
      }
    }

    // 5. Rotate shamir_shares
    const shamirShares = await this.prisma.shamirShare.findMany();
    for (const share of shamirShares) {
      try {
        const rotated = this.encryption.rotateEncryption(
          {
            ciphertext: share.encryptedShare,
            iv: share.iv,
            authTag: share.authTag,
            salt: share.salt,
            encryptedDek: share.encryptedDek,
          },
          oldPassword,
          newPassword,
          (share as any).keyVersion ?? 1,
        );

        await this.prisma.$transaction(async (tx) => {
          await tx.shamirShare.update({
            where: { id: share.id },
            data: {
              encryptedShare: rotated.ciphertext,
              iv: rotated.iv,
              authTag: rotated.authTag,
              salt: rotated.salt,
              encryptedDek: rotated.encryptedDek,
            },
          });
        });

        await this.prisma.$executeRaw`
          UPDATE shamir_shares SET key_version = ${rotated.keyVersion ?? 2} WHERE id = ${share.id}
        `;

        result.rotatedShares++;

        await this.audit.log({
          operation: 'key_rotation',
          clientId: share.clientId,
          requestedBy: 'system',
          metadata: {
            table: 'shamir_shares',
            recordId: share.id.toString(),
            shareIndex: share.shareIndex,
            newKeyVersion: rotated.keyVersion,
          },
        });
      } catch (error: any) {
        const msg = `Failed to rotate shamir_share id=${share.id}: ${error.message}`;
        this.logger.error(msg);
        result.errors.push(msg);
      }
    }

    // 6. Log rotation summary to audit
    await this.audit.log({
      operation: 'master_password_rotation_complete',
      requestedBy: 'system',
      metadata: {
        rotatedSeeds: result.rotatedSeeds,
        rotatedProjectSeeds: result.rotatedProjectSeeds,
        rotatedKeys: result.rotatedKeys,
        rotatedShares: result.rotatedShares,
        errorCount: result.errors.length,
      },
    });

    this.logger.warn(
      `Master password rotation complete: seeds=${result.rotatedSeeds}, ` +
        `projectSeeds=${result.rotatedProjectSeeds}, keys=${result.rotatedKeys}, ` +
        `shares=${result.rotatedShares}, errors=${result.errors.length}`,
    );

    return result;
  }
}
