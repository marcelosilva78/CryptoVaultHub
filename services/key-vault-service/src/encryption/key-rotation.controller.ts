import { Controller, Post, Body, Logger } from '@nestjs/common';
import { KeyRotationService } from './key-rotation.service';
import { RotateMasterPasswordDto } from './dto/rotate-master-password.dto';

@Controller('keys')
export class KeyRotationController {
  private readonly logger = new Logger(KeyRotationController.name);

  constructor(private readonly keyRotationService: KeyRotationService) {}

  /**
   * POST /keys/rotate-master
   *
   * Rotate the master password used for envelope encryption.
   * Re-encrypts all master_seeds, project_seeds, derived_keys, and shamir_shares.
   *
   * Protected by InternalServiceGuard (applied globally).
   * This is an admin-only operation — should only be invoked from the Admin Panel.
   *
   * IMPORTANT: After successful rotation, update VAULT_MASTER_PASSWORD in the
   * environment and restart the service.
   */
  @Post('rotate-master')
  async rotateMasterPassword(@Body() dto: RotateMasterPasswordDto) {
    this.logger.warn('Master password rotation requested');

    const result = await this.keyRotationService.rotateMasterPassword(
      dto.oldPassword,
      dto.newPassword,
    );

    return {
      success: result.errors.length === 0,
      ...result,
    };
  }
}
