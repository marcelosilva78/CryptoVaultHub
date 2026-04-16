import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/audit-log.service';

export interface SmtpSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_tls: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {
    const rawKey = this.configService.get<string>('INTERNAL_SERVICE_KEY', '');
    this.encryptionKey = scryptSync(rawKey, 'cvh-settings-encryption', 32);
  }

  private encryptValue(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptValue(stored: string): string {
    try {
      const [ivHex, authTagHex, encryptedHex] = stored.split(':');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(ivHex, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      return (
        decipher.update(Buffer.from(encryptedHex, 'hex')).toString('utf8') +
        decipher.final('utf8')
      );
    } catch {
      this.logger.warn('Failed to decrypt setting value — returning empty');
      return '';
    }
  }

  private maskPassword(password: string): string {
    if (!password || password.length === 0) return '';
    if (password.length <= 4) return '****';
    return '****' + password.slice(-4);
  }

  /**
   * Load all smtp_* settings from the database.
   * Passwords are masked for API responses.
   */
  async getSmtpSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        setting_key: string;
        setting_value: string;
        is_encrypted: number;
      }>
    >`
      SELECT setting_key, setting_value, is_encrypted
      FROM cvh_admin.system_settings
      WHERE setting_key LIKE 'smtp_%'
    `;

    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.setting_key === 'smtp_password') {
        // Decrypt then mask the password for API response
        const decrypted =
          row.is_encrypted && row.setting_value
            ? this.decryptValue(row.setting_value)
            : row.setting_value;
        result[row.setting_key] = this.maskPassword(decrypted);
      } else {
        result[row.setting_key] = row.setting_value;
      }
    }
    return result;
  }

  /**
   * Load raw (decrypted) SMTP settings for internal use (sending emails).
   */
  async getSmtpSettingsDecrypted(): Promise<SmtpSettings> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        setting_key: string;
        setting_value: string;
        is_encrypted: number;
      }>
    >`
      SELECT setting_key, setting_value, is_encrypted
      FROM cvh_admin.system_settings
      WHERE setting_key LIKE 'smtp_%'
    `;

    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.is_encrypted && row.setting_value) {
        result[row.setting_key] = this.decryptValue(row.setting_value);
      } else {
        result[row.setting_key] = row.setting_value;
      }
    }
    return result as unknown as SmtpSettings;
  }

  /**
   * Update SMTP settings. Encrypts the password before storing.
   */
  async updateSmtpSettings(
    data: Record<string, string>,
    adminUserId: string,
    ipAddress?: string,
  ): Promise<Record<string, string>> {
    const allowedKeys = [
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_password',
      'smtp_from_email',
      'smtp_from_name',
      'smtp_tls',
    ];

    for (const [key, value] of Object.entries(data)) {
      if (!allowedKeys.includes(key)) continue;

      // For smtp_password, skip if it's the masked placeholder
      if (key === 'smtp_password' && (value === '' || value.startsWith('****'))) {
        continue;
      }

      const isEncrypted = key === 'smtp_password';
      const storedValue = isEncrypted ? this.encryptValue(value) : value;

      await this.prisma.$executeRaw`
        UPDATE cvh_admin.system_settings
        SET setting_value = ${storedValue},
            is_encrypted = ${isEncrypted},
            updated_by = ${BigInt(adminUserId)},
            updated_at = NOW()
        WHERE setting_key = ${key}
      `;
    }

    await this.auditLog.log({
      adminUserId,
      action: 'settings.smtp_updated',
      entityType: 'system_settings',
      entityId: 'smtp',
      details: {
        updatedKeys: Object.keys(data).filter(
          (k) => allowedKeys.includes(k) && !(k === 'smtp_password' && data[k].startsWith('****')),
        ),
      },
      ipAddress,
    });

    this.logger.log(`SMTP settings updated by admin ${adminUserId}`);

    return this.getSmtpSettings();
  }

  /**
   * Test SMTP connection by sending a test email.
   * Can use either saved settings or custom values from the request body.
   */
  async testSmtpConnection(
    recipientEmail: string,
    overrides?: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    // Lazy-load nodemailer to keep module lightweight
    let nodemailer: typeof import('nodemailer');
    try {
      nodemailer = await import('nodemailer');
    } catch {
      return {
        success: false,
        error: 'nodemailer is not installed. Run: npm install nodemailer',
      };
    }

    // Load saved settings as base
    const saved = await this.getSmtpSettingsDecrypted();

    // Merge with overrides (use override values if provided, except masked password)
    const config = { ...saved };
    if (overrides) {
      if (overrides.smtp_host) config.smtp_host = overrides.smtp_host;
      if (overrides.smtp_port) config.smtp_port = overrides.smtp_port;
      if (overrides.smtp_user) config.smtp_user = overrides.smtp_user;
      if (overrides.smtp_from_email)
        config.smtp_from_email = overrides.smtp_from_email;
      if (overrides.smtp_from_name)
        config.smtp_from_name = overrides.smtp_from_name;
      if (overrides.smtp_tls) config.smtp_tls = overrides.smtp_tls;
      // Only use override password if it's not the masked placeholder
      if (
        overrides.smtp_password &&
        !overrides.smtp_password.startsWith('****')
      ) {
        config.smtp_password = overrides.smtp_password;
      }
    }

    if (!config.smtp_host) {
      return {
        success: false,
        error: 'SMTP host is not configured. Please set the SMTP host first.',
      };
    }

    try {
      const transport = nodemailer.createTransport({
        host: config.smtp_host,
        port: parseInt(config.smtp_port || '587', 10),
        secure: config.smtp_tls === 'true' && parseInt(config.smtp_port || '587', 10) === 465,
        auth:
          config.smtp_user && config.smtp_password
            ? {
                user: config.smtp_user,
                pass: config.smtp_password,
              }
            : undefined,
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      } as any);

      await transport.verify();

      await transport.sendMail({
        from: `"${config.smtp_from_name || 'CryptoVaultHub'}" <${config.smtp_from_email || 'noreply@vaulthub.live'}>`,
        to: recipientEmail,
        subject: 'CryptoVaultHub - SMTP Test Email',
        text: 'This is a test email from CryptoVaultHub. Your SMTP settings are working correctly.',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #10b981; margin-bottom: 16px;">SMTP Test Successful</h2>
            <p style="color: #374151; line-height: 1.6;">
              This is a test email from <strong>CryptoVaultHub</strong>. Your SMTP settings are working correctly.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; font-size: 12px;">
              Sent from CryptoVaultHub Admin Panel &middot; ${new Date().toISOString()}
            </p>
          </div>
        `,
      });

      this.logger.log(`SMTP test email sent successfully to ${recipientEmail}`);
      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown SMTP error';
      this.logger.warn(`SMTP test failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send an email using the configured SMTP settings.
   * Used internally by invite flow and other services.
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ success: boolean; error?: string }> {
    let nodemailer: typeof import('nodemailer');
    try {
      nodemailer = await import('nodemailer');
    } catch {
      return { success: false, error: 'nodemailer is not installed' };
    }

    const config = await this.getSmtpSettingsDecrypted();

    if (!config.smtp_host) {
      return { success: false, error: 'SMTP is not configured' };
    }

    try {
      const transport = nodemailer.createTransport({
        host: config.smtp_host,
        port: parseInt(config.smtp_port || '587', 10),
        secure: config.smtp_tls === 'true' && parseInt(config.smtp_port || '587', 10) === 465,
        auth:
          config.smtp_user && config.smtp_password
            ? {
                user: config.smtp_user,
                pass: config.smtp_password,
              }
            : undefined,
        tls: {
          rejectUnauthorized: false,
        },
      } as any);

      await transport.sendMail({
        from: `"${config.smtp_from_name || 'CryptoVaultHub'}" <${config.smtp_from_email || 'noreply@vaulthub.live'}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown SMTP error';
      this.logger.error(`Failed to send email to ${options.to}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}
