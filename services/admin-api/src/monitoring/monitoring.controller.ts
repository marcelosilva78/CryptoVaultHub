import { Controller, Get } from '@nestjs/common';
import { AdminAuth } from '../common/decorators';
import { MonitoringService } from './monitoring.service';

@Controller('admin')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('monitoring/health')
  @AdminAuth()
  async getHealth() {
    const health = await this.monitoringService.getHealth();
    return { success: true, ...health };
  }

  @Get('monitoring/queues')
  @AdminAuth()
  async getQueueStatus() {
    const queues = await this.monitoringService.getQueueStatus();
    return { success: true, queues };
  }

  @Get('gas-tanks')
  @AdminAuth()
  async getGasTanks() {
    const gasTanks = await this.monitoringService.getGasTanks();
    return { success: true, gasTanks };
  }
}
