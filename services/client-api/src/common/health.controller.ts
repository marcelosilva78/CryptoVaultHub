import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('client/v1')
export class HealthController {
  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: `Returns the current health status of the Client API service. This endpoint does not require authentication and can be used for uptime monitoring, load balancer health checks, and readiness probes.

**Response fields:**
- \`status\` — Always \`"ok"\` if the service is responding
- \`service\` — Service identifier (\`"client-api"\`)
- \`timestamp\` — ISO 8601 timestamp of the response`,
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'client-api' },
        timestamp: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
      },
    },
  })
  async health() {
    return {
      success: true,
      status: 'ok',
      service: 'client-api',
      timestamp: new Date().toISOString(),
    };
  }
}
