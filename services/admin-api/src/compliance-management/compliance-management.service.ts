import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class ComplianceManagementService {
  private readonly logger = new Logger(ComplianceManagementService.name);
  private readonly notificationServiceUrl: string;

  constructor(
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
  ) {
    this.notificationServiceUrl = this.configService.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
  }

  async listAlerts(params: {
    page: number;
    limit: number;
    status?: string;
    clientId?: string;
    severity?: string;
  }) {
    const queryParams = new URLSearchParams();
    queryParams.set('page', params.page.toString());
    queryParams.set('limit', params.limit.toString());
    if (params.status) queryParams.set('status', params.status);
    if (params.clientId) queryParams.set('clientId', params.clientId);
    if (params.severity) queryParams.set('severity', params.severity);

    const response = await axios.get(
      `${this.notificationServiceUrl}/compliance/alerts?${queryParams.toString()}`,
      { timeout: 10000 },
    );
    return response.data;
  }

  async forceSanctionsSync(adminUserId: string) {
    try {
      const response = await axios.post(
        `${this.notificationServiceUrl}/compliance/sanctions/force-sync`,
        { triggeredBy: adminUserId },
        { timeout: 15000 },
      );
      await this.auditLog.log({
        action: 'compliance.sanctions.force_sync',
        adminUserId,
        details: { triggered: true },
      });
      return response.data;
    } catch (err) {
      this.logger.warn(`Failed to trigger sanctions sync: ${(err as Error).message}`);
      return { message: 'Sync initiated (backend may be unavailable)', jobId: null };
    }
  }

  async updateAlert(
    id: string,
    data: {
      status?: string;
      notes?: string;
      assignedTo?: string;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const response = await axios.patch(
      `${this.notificationServiceUrl}/compliance/alerts/${id}`,
      data,
      { timeout: 10000 },
    );

    await this.auditLog.log({
      adminUserId,
      action: 'compliance.alert_update',
      entityType: 'compliance_alert',
      entityId: id,
      details: data,
      ipAddress,
    });

    return response.data;
  }
}
