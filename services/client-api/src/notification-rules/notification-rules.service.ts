import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminDatabaseService } from '../prisma/admin-database.service';

@Injectable()
export class NotificationRulesService {
  private readonly logger = new Logger(NotificationRulesService.name);

  constructor(private readonly db: AdminDatabaseService) {}

  /** List active notification rules for a client. */
  async listRules(clientId: number) {
    const rows = await this.db.query(
      `SELECT id, client_id, name, event_type, condition_type,
              condition_value, delivery_method, delivery_target,
              is_enabled, created_at, updated_at
       FROM cvh_notifications.notification_rules
       WHERE client_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [clientId],
    );

    return {
      rules: rows.map((r: any) => ({
        id: Number(r.id),
        clientId: Number(r.client_id),
        name: r.name,
        eventType: r.event_type,
        conditionType: r.condition_type,
        conditionValue: r.condition_value,
        deliveryMethod: r.delivery_method,
        deliveryTarget: r.delivery_target,
        isEnabled: Boolean(r.is_enabled),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  }

  /** Create a new notification rule. */
  async createRule(
    clientId: number,
    data: {
      name: string;
      eventType: string;
      conditionType?: string;
      conditionValue?: string;
      deliveryMethod?: string;
      deliveryTarget?: string;
    },
  ) {
    await this.db.query(
      `INSERT INTO cvh_notifications.notification_rules
         (client_id, name, event_type, condition_type, condition_value,
          delivery_method, delivery_target)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        data.name,
        data.eventType,
        data.conditionType ?? 'always',
        data.conditionValue ?? null,
        data.deliveryMethod ?? 'email',
        data.deliveryTarget ?? null,
      ],
    );

    // Return newly created rule
    const [created] = await this.db.query(
      `SELECT id, client_id, name, event_type, condition_type,
              condition_value, delivery_method, delivery_target,
              is_enabled, created_at, updated_at
       FROM cvh_notifications.notification_rules
       WHERE client_id = ? AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [clientId],
    );

    return {
      rule: {
        id: Number(created.id),
        clientId: Number(created.client_id),
        name: created.name,
        eventType: created.event_type,
        conditionType: created.condition_type,
        conditionValue: created.condition_value,
        deliveryMethod: created.delivery_method,
        deliveryTarget: created.delivery_target,
        isEnabled: Boolean(created.is_enabled),
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    };
  }

  /** Update an existing rule. */
  async updateRule(
    clientId: number,
    ruleId: number,
    data: {
      name?: string;
      eventType?: string;
      conditionType?: string;
      conditionValue?: string;
      deliveryMethod?: string;
      deliveryTarget?: string;
      isEnabled?: boolean;
    },
  ) {
    // Verify ownership
    const [existing] = await this.db.query(
      `SELECT id FROM cvh_notifications.notification_rules
       WHERE id = ? AND client_id = ? AND deleted_at IS NULL`,
      [ruleId, clientId],
    );
    if (!existing) {
      throw new NotFoundException(`Notification rule ${ruleId} not found`);
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      setClauses.push('name = ?');
      params.push(data.name);
    }
    if (data.eventType !== undefined) {
      setClauses.push('event_type = ?');
      params.push(data.eventType);
    }
    if (data.conditionType !== undefined) {
      setClauses.push('condition_type = ?');
      params.push(data.conditionType);
    }
    if (data.conditionValue !== undefined) {
      setClauses.push('condition_value = ?');
      params.push(data.conditionValue);
    }
    if (data.deliveryMethod !== undefined) {
      setClauses.push('delivery_method = ?');
      params.push(data.deliveryMethod);
    }
    if (data.deliveryTarget !== undefined) {
      setClauses.push('delivery_target = ?');
      params.push(data.deliveryTarget);
    }
    if (data.isEnabled !== undefined) {
      setClauses.push('is_enabled = ?');
      params.push(data.isEnabled ? 1 : 0);
    }

    if (setClauses.length > 0) {
      params.push(ruleId, clientId);
      await this.db.query(
        `UPDATE cvh_notifications.notification_rules
         SET ${setClauses.join(', ')}
         WHERE id = ? AND client_id = ?`,
        params,
      );
    }

    const [updated] = await this.db.query(
      `SELECT id, client_id, name, event_type, condition_type,
              condition_value, delivery_method, delivery_target,
              is_enabled, created_at, updated_at
       FROM cvh_notifications.notification_rules
       WHERE id = ? AND client_id = ?`,
      [ruleId, clientId],
    );

    return {
      rule: {
        id: Number(updated.id),
        clientId: Number(updated.client_id),
        name: updated.name,
        eventType: updated.event_type,
        conditionType: updated.condition_type,
        conditionValue: updated.condition_value,
        deliveryMethod: updated.delivery_method,
        deliveryTarget: updated.delivery_target,
        isEnabled: Boolean(updated.is_enabled),
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    };
  }

  /** Soft-delete a rule. */
  async deleteRule(clientId: number, ruleId: number) {
    const [existing] = await this.db.query(
      `SELECT id FROM cvh_notifications.notification_rules
       WHERE id = ? AND client_id = ? AND deleted_at IS NULL`,
      [ruleId, clientId],
    );
    if (!existing) {
      throw new NotFoundException(`Notification rule ${ruleId} not found`);
    }

    await this.db.query(
      `UPDATE cvh_notifications.notification_rules
       SET deleted_at = NOW()
       WHERE id = ? AND client_id = ?`,
      [ruleId, clientId],
    );
  }
}
