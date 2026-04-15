import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { SecurityService } from './security.service';

@ApiTags('Security')
@ApiSecurity('ApiKey')
@Controller('client/v1/security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  // ────────────────────────────────────────────────────────────
  // 5. GET /client/v1/security/settings
  // ────────────────────────────────────────────────────────────

  @Get('settings')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get current security settings',
    description:
      'Returns the client custody mode, safe mode status, and 2FA status.',
  })
  @ApiResponse({ status: 200, description: 'Security settings' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getSettings(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.securityService.getSettings(clientId);
    return { success: true, ...result };
  }

  // ────────────────────────────────────────────────────────────
  // 6. GET /client/v1/security/2fa-status
  // ────────────────────────────────────────────────────────────

  @Get('2fa-status')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get 2FA configuration status',
    description:
      'Returns whether 2FA (TOTP) is enabled for the authenticated user and its configuration.',
  })
  @ApiResponse({ status: 200, description: '2FA status' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async get2faStatus(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.securityService.get2faStatus(clientId);
    return { success: true, ...result };
  }

  // ────────────────────────────────────────────────────────────
  // 7. PATCH /client/v1/security/custody-mode
  // ────────────────────────────────────────────────────────────

  @Patch('custody-mode')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Change custody mode',
    description:
      'Updates the custody policy for the authenticated client. Requires appropriate authorization.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: {
          type: 'string',
          enum: ['full_custody', 'co_sign', 'client_initiated'],
          example: 'co_sign',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Custody mode updated' })
  @ApiResponse({
    status: 400,
    description: 'Invalid custody mode',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async updateCustodyMode(
    @Body() dto: { mode: 'full_custody' | 'co_sign' | 'client_initiated' },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.securityService.updateCustodyMode(
      clientId,
      dto.mode,
    );
    return { success: true, ...result };
  }

  // ────────────────────────────────────────────────────────────
  // 8. POST /client/v1/security/safe-mode
  // ────────────────────────────────────────────────────────────

  @Post('safe-mode')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Activate safe mode (irrevocable)',
    description:
      'Activates safe mode on the client wallet smart contract. Requires a valid TOTP code. This action is irrevocable.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['totpCode'],
      properties: {
        totpCode: {
          type: 'string',
          example: '123456',
          description: 'TOTP code from authenticator app',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Safe mode activated',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid TOTP code',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async activateSafeMode(
    @Body() dto: { totpCode: string },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.securityService.activateSafeMode(
      clientId,
      dto.totpCode,
    );
    return { success: true, ...result };
  }

  // ────────────────────────────────────────────────────────────
  // 9. GET /client/v1/security/shamir-shares
  // ────────────────────────────────────────────────────────────

  @Get('shamir-shares')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get Shamir backup share status',
    description:
      'Returns the status of Shamir secret sharing backup shares (indices and custodian names only, never the actual share data).',
  })
  @ApiResponse({
    status: 200,
    description: 'Shamir share status',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async getShamirShares(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.securityService.getShamirShares(clientId);
    return { success: true, ...result };
  }
}
