import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import {
  ManualScreenDto,
  UpdateAlertDto,
  ListAlertsQueryDto,
  ListScreeningsQueryDto,
} from '../common/dto/compliance.dto';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  /**
   * Manual address screening.
   */
  @Post('screen')
  async screenAddress(@Body() dto: ManualScreenDto) {
    const result = await this.complianceService.screenAddress({
      address: dto.address,
      direction: (dto.direction as 'inbound' | 'outbound') || 'inbound',
      trigger: 'manual',
      clientId: dto.clientId,
      txHash: dto.txHash,
    });
    return { success: true, screening: result };
  }

  /**
   * List compliance alerts with optional filters.
   */
  @Get('alerts')
  async listAlerts(@Query() query: ListAlertsQueryDto) {
    const alerts = await this.complianceService.listAlerts({
      clientId: query.clientId,
      status: query.status,
      severity: query.severity,
    });
    return { success: true, count: alerts.length, alerts };
  }

  /**
   * Update an alert's status.
   */
  @Patch('alerts/:id')
  async updateAlert(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAlertDto,
  ) {
    const alert = await this.complianceService.updateAlert(id, {
      status: dto.status,
      resolvedBy: dto.resolvedBy,
    });
    return { success: true, alert };
  }

  /**
   * List screening history.
   */
  @Get('screenings')
  async listScreenings(@Query() query: ListScreeningsQueryDto) {
    const screenings = await this.complianceService.listScreenings({
      clientId: query.clientId,
      address: query.address,
      result: query.result,
    });
    return { success: true, count: screenings.length, screenings };
  }
}
