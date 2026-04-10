import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ImpersonationService } from './impersonation.service';
import { InternalServiceGuard } from '../common/guards/internal-service.guard';

@Controller('auth/impersonate')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  @Post('start')
  @UseGuards(AuthGuard('jwt'))
  async startSession(@Body() dto: { targetClientId: number; reason: string }, @Req() req: Request) {
    const adminUserId = (req as any).user.userId;
    const result = await this.impersonationService.startSession({
      adminUserId,
      targetClientId: dto.targetClientId,
      reason: dto.reason,
      ipAddress: req.ip,
    });
    return { success: true, ...result };
  }

  /**
   * CRIT-1: This endpoint MUST be protected by InternalServiceGuard.
   * It is called by other internal services to validate impersonation
   * sessions and must not be publicly accessible.
   */
  @Get('validate/:sessionId')
  @UseGuards(InternalServiceGuard)
  @HttpCode(HttpStatus.OK)
  async validateSession(@Param('sessionId') sessionId: string) {
    const result = await this.impersonationService.validateSession(sessionId);
    return result;
  }

  @Post('end/:sessionId')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async endSession(@Param('sessionId') sessionId: string, @Req() req: Request) {
    const adminUserId = (req as any).user.userId;
    const result = await this.impersonationService.endSession(sessionId, adminUserId);
    return result;
  }
}
