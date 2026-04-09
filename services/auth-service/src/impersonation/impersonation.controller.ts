import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { ImpersonationService, ImpersonationMode } from './impersonation.service';
import { AdminAuth } from '../rbac/admin-auth.decorator';

@Controller('auth')
export class ImpersonationController {
  constructor(
    private readonly impersonationService: ImpersonationService,
  ) {}

  /**
   * Start an impersonation session.
   * Only super_admin and admin roles can impersonate.
   */
  @Post('impersonate')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  async startImpersonation(
    @Body()
    body: {
      targetClientId: number;
      targetProjectId?: number;
      mode: ImpersonationMode;
    },
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const session = await this.impersonationService.startSession({
      adminUserId: Number(user.userId),
      targetClientId: body.targetClientId,
      targetProjectId: body.targetProjectId,
      mode: body.mode,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return {
      success: true,
      session: {
        id: session.id,
        targetClientId: session.targetClientId,
        targetProjectId: session.targetProjectId,
        mode: session.mode,
        startedAt: session.startedAt,
      },
    };
  }

  /**
   * End the active impersonation session.
   */
  @Post('impersonate/end')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  async endImpersonation(@Req() req: Request) {
    const user = (req as any).user;
    await this.impersonationService.endSession(Number(user.userId));
    return { success: true, message: 'Impersonation session ended' };
  }

  /**
   * Get the active impersonation session for the current admin.
   */
  @Get('impersonate/active')
  @AdminAuth('super_admin', 'admin')
  async getActiveSession(@Req() req: Request) {
    const user = (req as any).user;
    const session = await this.impersonationService.getActiveSession(
      Number(user.userId),
    );
    return {
      success: true,
      session: session
        ? {
            id: session.id,
            targetClientId: session.targetClientId,
            targetProjectId: session.targetProjectId,
            mode: session.mode,
            startedAt: session.startedAt,
          }
        : null,
    };
  }

  /**
   * List impersonation sessions (for audit).
   */
  @Get('impersonation-sessions')
  @AdminAuth('super_admin')
  async listSessions(@Query() query: any) {
    const result = await this.impersonationService.listSessions({
      page: parseInt(query.page as string) || 1,
      limit: parseInt(query.limit as string) || 20,
      adminUserId: query.adminUserId
        ? parseInt(query.adminUserId as string)
        : undefined,
    });
    return { success: true, ...result };
  }

  /**
   * Internal endpoint: validate an impersonation session by ID.
   * Called by the admin-api impersonation guard.
   */
  @Post('impersonate/validate')
  @HttpCode(HttpStatus.OK)
  async validateSession(@Body() body: { sessionId: number }) {
    const session = await this.impersonationService.validateSession(
      body.sessionId,
    );
    return {
      valid: !!session,
      session: session
        ? {
            id: session.id,
            adminUserId: session.adminUserId,
            targetClientId: session.targetClientId,
            targetProjectId: session.targetProjectId,
            mode: session.mode,
          }
        : null,
    };
  }
}
