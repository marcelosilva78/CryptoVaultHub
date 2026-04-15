import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { AuditLogService } from '../common/audit-log.service';

@ApiTags('Audit Log')
@ApiBearerAuth('JWT')
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List audit log entries',
    description: `Returns a paginated list of admin audit log entries with optional filtering by action type, admin user, and date range.

All admin actions (client creation, updates, key generation, compliance reviews, etc.) are logged here with full traceability.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiQuery({ name: 'page', required: false, type: 'integer', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: 'integer', example: 20 })
  @ApiQuery({ name: 'action', required: false, type: 'string', example: 'client.create' })
  @ApiQuery({ name: 'adminUserId', required: false, type: 'string' })
  @ApiQuery({ name: 'entityType', required: false, type: 'string', example: 'client' })
  @ApiQuery({ name: 'dateFrom', required: false, type: 'string', example: '2026-04-01' })
  @ApiQuery({ name: 'dateTo', required: false, type: 'string', example: '2026-04-14' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of audit log entries',
    schema: {
      example: {
        success: true,
        items: [
          {
            id: '42',
            adminUserId: 'admin-user-1',
            action: 'client.create',
            entityType: 'client',
            entityId: '7',
            details: { name: 'Acme Exchange', slug: 'acme-exchange' },
            ipAddress: '192.168.1.100',
            createdAt: '2026-04-14T10:30:00Z',
          },
        ],
        total: 156,
        page: 1,
        limit: 20,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('adminUserId') adminUserId?: string,
    @Query('entityType') entityType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const result = await this.auditLogService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
      adminUserId: adminUserId || undefined,
      entityType: entityType || undefined,
      action: action || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });

    return { success: true, ...result };
  }
}
