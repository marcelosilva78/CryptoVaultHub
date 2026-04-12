import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { ComplianceManagementService } from './compliance-management.service';
import {
  ListAlertsQueryDto,
  UpdateAlertDto,
} from '../common/dto/compliance.dto';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller('admin/compliance')
export class ComplianceManagementController {
  constructor(
    private readonly complianceService: ComplianceManagementService,
  ) {}

  @Get('alerts')
  @AdminAuth()
  @ApiOperation({
    summary: 'List compliance alerts',
    description: `Returns a paginated list of KYT/AML compliance alerts with optional filtering.

**Alert sources:**
- **Sanctions screening:** Triggered when a deposit/withdrawal address matches OFAC, EU, or UN sanctions lists
- **Threshold alerts:** Triggered when transaction amounts exceed configurable thresholds
- **Pattern detection:** Triggered by suspicious transaction patterns (structuring, rapid movement, etc.)

**Alert lifecycle:**
1. \`pending\` -- New alert awaiting review
2. \`acknowledged\` -- Alert has been seen by a compliance officer
3. \`escalated\` -- Alert requires senior review or external reporting
4. \`resolved\` -- Alert has been handled and documented
5. \`dismissed\` -- Alert determined to be a false positive

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of compliance alerts',
    schema: {
      example: {
        success: true,
        alerts: [
          {
            id: 'alert-a1b2c3d4',
            clientId: 1,
            clientName: 'Acme Exchange',
            type: 'sanctions_match',
            severity: 'high',
            status: 'pending',
            address: '0x1234...abcd',
            txHash: '0xabcd...1234',
            chainId: 1,
            amount: '50000.00',
            currency: 'USDC',
            sanctionsList: 'OFAC SDN',
            matchScore: 0.95,
            createdAt: '2026-04-09T08:15:00Z',
          },
          {
            id: 'alert-e5f6g7h8',
            clientId: 2,
            clientName: 'BlockPay Solutions',
            type: 'threshold_exceeded',
            severity: 'medium',
            status: 'acknowledged',
            address: '0x5678...efgh',
            txHash: '0xefgh...5678',
            chainId: 137,
            amount: '25000.00',
            currency: 'USDT',
            createdAt: '2026-04-09T09:30:00Z',
          },
        ],
        meta: { page: 1, limit: 20, total: 8 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
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
  @ApiOperation({
    summary: 'Update a compliance alert',
    description: `Updates the status, assignment, or notes of a compliance alert.

**Status transitions:**
- \`pending\` -> \`acknowledged\`: Mark alert as reviewed
- \`acknowledged\` -> \`escalated\`: Flag for senior review or SAR filing
- \`acknowledged\` -> \`resolved\`: Mark as handled with documentation
- \`acknowledged\` -> \`dismissed\`: Close as false positive (requires notes)
- \`escalated\` -> \`resolved\`: Mark escalated alert as handled

**Audit trail:** All updates are logged with the acting user's ID, timestamp, and IP address for regulatory compliance. The notes field should document the rationale for any status change.

**Important:** Dismissing a high-severity alert without notes will return a 400 error.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique string identifier of the compliance alert',
    type: 'string',
    example: 'alert-a1b2c3d4',
  })
  @ApiBody({
    type: UpdateAlertDto,
    examples: {
      acknowledge: {
        summary: 'Acknowledge an alert',
        value: {
          status: 'acknowledged',
          assignedTo: 'compliance-officer@acme.com',
        },
      },
      dismiss: {
        summary: 'Dismiss as false positive',
        value: {
          status: 'dismissed',
          notes: 'Address belongs to a known regulated exchange (Coinbase). False positive from partial SDN name match.',
        },
      },
      escalate: {
        summary: 'Escalate for senior review',
        value: {
          status: 'escalated',
          assignedTo: 'chief-compliance@acme.com',
          notes: 'Multiple high-value transactions from sanctioned jurisdiction. Recommend SAR filing.',
        },
      },
      resolve: {
        summary: 'Resolve after investigation',
        value: {
          status: 'resolved',
          notes: 'Investigation complete. Client provided KYC documentation confirming legitimate business activity. No suspicious activity found.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Alert updated successfully',
    schema: {
      example: {
        success: true,
        alert: {
          id: 'alert-a1b2c3d4',
          status: 'acknowledged',
          assignedTo: 'compliance-officer@acme.com',
          notes: null,
          updatedAt: '2026-04-09T14:00:00Z',
          updatedBy: 'admin-user-1',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid status transition or missing required notes' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
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

  @Post('sanctions/force-sync')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Force re-sync of sanctions lists',
    description: `Triggers an immediate synchronization of all sanctions lists (OFAC SDN, EU Consolidated, UN Security Council, OFAC Non-SDN).\n\nNormally these lists sync automatically every 24 hours. Use this to force an immediate update after a known list publication.\n\n**Requires super_admin or admin role.**`,
  })
  @ApiResponse({ status: 200, description: 'Sync initiated', schema: { example: { success: true, message: 'Sanctions list sync initiated', jobId: 'sanctions-sync-123', estimatedDuration: '2-5 minutes' } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async forceSanctionsSync(@Req() req: Request) {
    const user = (req as any).user;
    const result = await this.complianceService.forceSanctionsSync(user.userId);
    return { success: true, ...result };
  }
}
