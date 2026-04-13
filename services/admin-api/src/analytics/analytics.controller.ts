import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth('JWT')
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @AdminAuth()
  @ApiOperation({ summary: 'Get analytics overview (client KPIs, tier distribution, client growth, daily volumes)' })
  @ApiResponse({ status: 200, description: 'Analytics overview data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('operations')
  @AdminAuth()
  @ApiOperation({ summary: 'Get operations analytics (RPC health, queue depths, gas tanks, webhook delivery)' })
  @ApiResponse({ status: 200, description: 'Operations analytics data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getOperations() {
    return this.analyticsService.getOperations();
  }

  @Get('compliance')
  @AdminAuth()
  @ApiOperation({ summary: 'Get compliance analytics (alert counts, screenings per day, severity trends)' })
  @ApiResponse({ status: 200, description: 'Compliance analytics data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getCompliance() {
    return this.analyticsService.getCompliance();
  }
}
