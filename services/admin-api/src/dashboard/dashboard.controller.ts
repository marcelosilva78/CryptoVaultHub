import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('balance')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get total custody balance across all chains (VaultMeter widget)',
  })
  @ApiResponse({ status: 200, description: 'Custody balance by chain' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getBalance() {
    return this.dashboardService.getBalance();
  }
}
