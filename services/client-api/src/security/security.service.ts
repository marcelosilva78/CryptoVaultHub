import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AdminDatabaseService } from '../prisma/admin-database.service';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly authServiceUrl: string;
  private readonly coreWalletUrl: string;
  private readonly keyVaultUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: AdminDatabaseService,
  ) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
    this.keyVaultUrl = this.configService.get<string>(
      'KEY_VAULT_SERVICE_URL',
      'http://localhost:3005',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  // ────────────────────────────────────────────────────────────
  // 5. GET /client/v1/security/settings
  // ────────────────────────────────────────────────────────────

  async getSettings(clientId: number) {
    // Fetch client record from cvh_admin for custody_mode
    const [client] = await this.db.query(
      `SELECT id, custody_mode, status FROM cvh_admin.clients WHERE id = ?`,
      [clientId],
    );

    // Fetch 2FA status from auth-service (best-effort)
    let twoFactorEnabled = false;
    try {
      const { data } = await axios.get(
        `${this.authServiceUrl}/auth/users/${clientId}/2fa-status`,
        { headers: this.headers, timeout: 5000 },
      );
      twoFactorEnabled = data?.enabled === true;
    } catch {
      this.logger.warn(
        `Could not fetch 2FA status from auth-service for client ${clientId}`,
      );
    }

    // Safe mode check — query core-wallet-service (best-effort)
    let safeModeActive = false;
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}/safe-mode`,
        { headers: this.headers, timeout: 5000 },
      );
      safeModeActive = data?.active === true;
    } catch {
      // safe mode endpoint may not exist yet
    }

    return {
      custodyMode: client?.custody_mode ?? 'full_custody',
      safeModeActive,
      twoFactorEnabled,
      clientStatus: client?.status ?? 'unknown',
    };
  }

  // ────────────────────────────────────────────────────────────
  // 6. GET /client/v1/security/2fa-status
  // ────────────────────────────────────────────────────────────

  async get2faStatus(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.authServiceUrl}/auth/users/${clientId}/2fa-status`,
        { headers: this.headers, timeout: 5000 },
      );
      return {
        enabled: data?.enabled === true,
        method: data?.method ?? null,
        verifiedAt: data?.verifiedAt ?? null,
      };
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Auth service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Auth service unavailable');
    }
  }

  // ────────────────────────────────────────────────────────────
  // 7. PATCH /client/v1/security/custody-mode
  // ────────────────────────────────────────────────────────────

  async updateCustodyMode(
    clientId: number,
    mode: 'full_custody' | 'co_sign' | 'client_initiated',
  ) {
    const validModes = ['full_custody', 'co_sign', 'client_initiated'];
    if (!validModes.includes(mode)) {
      throw new BadRequestException(
        `Invalid custody mode. Allowed: ${validModes.join(', ')}`,
      );
    }

    // Map client_initiated to self_managed at DB level if needed
    const dbMode = mode === 'client_initiated' ? 'self_managed' : mode;

    await this.db.query(
      `UPDATE cvh_admin.clients SET custody_mode = ? WHERE id = ?`,
      [dbMode, clientId],
    );

    return {
      custodyMode: mode,
      message: 'Custody mode updated successfully',
    };
  }

  // ────────────────────────────────────────────────────────────
  // 8. POST /client/v1/security/safe-mode
  // ────────────────────────────────────────────────────────────

  async activateSafeMode(clientId: number, totpCode: string) {
    if (!totpCode || totpCode.length < 6) {
      throw new BadRequestException('Valid TOTP code is required');
    }

    // Step 1: Verify TOTP with auth-service
    try {
      const { data: verifyResult } = await axios.post(
        `${this.authServiceUrl}/auth/users/${clientId}/verify-totp`,
        { code: totpCode },
        { headers: this.headers, timeout: 5000 },
      );
      if (!verifyResult?.valid) {
        throw new BadRequestException('Invalid TOTP code');
      }
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      if (error.response?.status === 400) {
        throw new BadRequestException(
          error.response.data?.message || 'Invalid TOTP code',
        );
      }
      throw new InternalServerErrorException('Auth service unavailable');
    }

    // Step 2: Activate safe mode on core-wallet-service
    // Calls the wallet service which triggers the on-chain activateSafeMode() via Key Vault signing
    try {
      const { data } = await axios.post(
        `${this.coreWalletUrl}/wallets/${clientId}/safe-mode/activate`,
        {},
        { headers: this.headers, timeout: 30000 },
      );
      return {
        safeModeActive: true,
        activatedAt: new Date().toISOString(),
        message:
          'Safe mode activated. This action is irrevocable.',
        ...data,
      };
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Failed to activate safe mode',
          error.response.status,
        );
      }
      throw new InternalServerErrorException(
        'Core wallet service unavailable',
      );
    }
  }

  // ────────────────────────────────────────────────────────────
  // 9. GET /client/v1/security/shamir-shares
  // ────────────────────────────────────────────────────────────

  async getShamirShares(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.keyVaultUrl}/keys/${clientId}/shamir-status`,
        { headers: this.headers, timeout: 5000 },
      );
      return {
        totalShares: data?.totalShares ?? 0,
        threshold: data?.threshold ?? 0,
        shares: (data?.shares ?? []).map((s: any) => ({
          index: s.index,
          custodianName: s.custodianName ?? null,
          createdAt: s.createdAt ?? null,
          // Never expose actual share data
        })),
      };
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Key vault service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException(
        'Key vault service unavailable',
      );
    }
  }
}
