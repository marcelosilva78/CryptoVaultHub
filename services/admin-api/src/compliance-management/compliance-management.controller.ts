import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuth } from '../common/decorators';
import { ComplianceManagementService } from './compliance-management.service';
import {
  ListAlertsQueryDto,
  UpdateAlertDto,
} from '../common/dto/compliance.dto';

@Controller('admin/compliance')
export class ComplianceManagementController {
  constructor(
    private readonly complianceService: ComplianceManagementService,
  ) {}

  @Get('alerts')
  @AdminAuth()
  async listAlerts(@Query() query: ListAlertsQueryDto) {
    const result = await this.complianceService.listAlerts({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      clientId: query.clientId,
      severity: query.severity,
    });
    return { success: true, ...result };
  }

  @Patch('alerts/:id')
  @AdminAuth('super_admin', 'admin')
  async updateAlert(
    @Param('id') id: string,
    @Body() dto: UpdateAlertDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const result = await this.complianceService.updateAlert(
      id,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, ...result };
  }
}
