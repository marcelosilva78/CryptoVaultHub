import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuditLogService } from '../common/audit-log.service';

@Injectable()
export class ChainManagementService {
  private readonly logger = new Logger(ChainManagementService.name);
  private readonly chainIndexerUrl: string;

  constructor(
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
  ) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  async addChain(
    data: {
      name: string;
      symbol: string;
      chainId: number;
      rpcUrl: string;
      explorerUrl?: string;
      confirmationsRequired?: number;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const response = await axios.post(
      `${this.chainIndexerUrl}/chains`,
      data,
      { timeout: 10000 },
    );

    await this.auditLog.log({
      adminUserId,
      action: 'chain.add',
      entityType: 'chain',
      entityId: data.chainId.toString(),
      details: { name: data.name, symbol: data.symbol },
      ipAddress,
    });

    this.logger.log(`Chain added: ${data.name} (chainId: ${data.chainId})`);
    return response.data;
  }

  async listChains() {
    const response = await axios.get(
      `${this.chainIndexerUrl}/chains`,
      { timeout: 10000 },
    );
    return response.data;
  }

  async addToken(
    data: {
      name: string;
      symbol: string;
      chainId: number;
      contractAddress: string;
      decimals: number;
      isActive?: boolean;
    },
    adminUserId: string,
    ipAddress?: string,
  ) {
    const response = await axios.post(
      `${this.chainIndexerUrl}/tokens`,
      data,
      { timeout: 10000 },
    );

    await this.auditLog.log({
      adminUserId,
      action: 'token.add',
      entityType: 'token',
      entityId: data.contractAddress,
      details: { name: data.name, symbol: data.symbol, chainId: data.chainId },
      ipAddress,
    });

    this.logger.log(`Token added: ${data.symbol} on chain ${data.chainId}`);
    return response.data;
  }

  async listTokens() {
    const response = await axios.get(
      `${this.chainIndexerUrl}/tokens`,
      { timeout: 10000 },
    );
    return response.data;
  }
}
