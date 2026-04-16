import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth('JWT')
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('smtp')
  @AdminAuth('super_admin')
  @ApiOperation({
    summary: 'Get current SMTP configuration',
    description:
      'Returns the current SMTP settings. The password is masked (only last 4 characters shown).',
  })
  @ApiResponse({
    status: 200,
    description: 'SMTP settings retrieved successfully',
    schema: {
      example: {
        success: true,
        settings: {
          smtp_host: 'smtp.example.com',
          smtp_port: '587',
          smtp_user: 'user@example.com',
          smtp_password: '****abcd',
          smtp_from_email: 'noreply@vaulthub.live',
          smtp_from_name: 'CryptoVaultHub',
          smtp_tls: 'true',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden -- requires super_admin role' })
  async getSmtpSettings() {
    const settings = await this.settingsService.getSmtpSettings();
    return { success: true, settings };
  }

  @Put('smtp')
  @AdminAuth('super_admin')
  @ApiOperation({
    summary: 'Update SMTP configuration',
    description:
      'Updates SMTP settings. The password is encrypted at rest. If the password field contains only asterisks, it is not updated.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        smtp_host: { type: 'string', example: 'smtp.example.com' },
        smtp_port: { type: 'string', example: '587' },
        smtp_user: { type: 'string', example: 'user@example.com' },
        smtp_password: { type: 'string', example: 'secret' },
        smtp_from_email: { type: 'string', example: 'noreply@vaulthub.live' },
        smtp_from_name: { type: 'string', example: 'CryptoVaultHub' },
        smtp_tls: { type: 'string', example: 'true' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'SMTP settings updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden -- requires super_admin role' })
  async updateSmtpSettings(@Body() body: Record<string, string>, @Req() req: Request) {
    const user = (req as any).user;
    const settings = await this.settingsService.updateSmtpSettings(
      body,
      user.userId,
      req.ip,
    );
    return { success: true, settings };
  }

  @Post('smtp/test')
  @AdminAuth('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test SMTP connection',
    description:
      'Sends a test email to verify SMTP settings. Can optionally receive settings overrides to test before saving.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['recipientEmail'],
      properties: {
        recipientEmail: {
          type: 'string',
          example: 'admin@vaulthub.live',
          description: 'Email address to send the test to',
        },
        smtp_host: { type: 'string' },
        smtp_port: { type: 'string' },
        smtp_user: { type: 'string' },
        smtp_password: { type: 'string' },
        smtp_from_email: { type: 'string' },
        smtp_from_name: { type: 'string' },
        smtp_tls: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Test result',
    schema: {
      example: { success: true },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden -- requires super_admin role' })
  async testSmtpConnection(@Body() body: Record<string, string>) {
    const { recipientEmail, ...overrides } = body;
    const result = await this.settingsService.testSmtpConnection(
      recipientEmail,
      Object.keys(overrides).length > 0 ? overrides : undefined,
    );
    return result;
  }
}
