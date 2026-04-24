import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Proxy service for project contract management.
 *
 * Delegates to core-wallet-service internal endpoints for:
 * - Triggering project contract deployments
 * - Querying deployment status
 * - Retrying failed deployments
 */
@Injectable()
export class ProjectContractService {
  private readonly logger = new Logger(ProjectContractService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3005',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    };
  }

  /**
   * Trigger deployment of all project contracts for a project+chain.
   */
  async deployProjectContracts(
    projectId: number,
    chainId: number,
    data: { clientId: number; signers: string[] },
  ) {
    try {
      const response = await axios.post(
        `${this.coreWalletUrl}/projects/${projectId}/chains/${chainId}/deploy`,
        data,
        { headers: this.headers, timeout: 300_000 },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to deploy project contracts: project=${projectId} chain=${chainId}`,
        error?.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        error?.response?.data?.message ||
          'Failed to trigger project contract deployment',
      );
    }
  }

  /**
   * Get deployment status for all contract types of a project+chain.
   */
  async getDeployStatus(projectId: number, chainId: number) {
    try {
      const response = await axios.get(
        `${this.coreWalletUrl}/projects/${projectId}/chains/${chainId}/contracts`,
        { headers: this.headers, timeout: 10_000 },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to get deploy status: project=${projectId} chain=${chainId}`,
        error?.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        error?.response?.data?.message ||
          'Failed to fetch project contract status',
      );
    }
  }

  /**
   * Retry a single failed contract deployment.
   */
  async retryFailedDeploy(
    projectId: number,
    chainId: number,
    contractType: string,
  ) {
    try {
      const response = await axios.post(
        `${this.coreWalletUrl}/projects/${projectId}/chains/${chainId}/contracts/${contractType}/retry`,
        {},
        { headers: this.headers, timeout: 120_000 },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to retry deploy: project=${projectId} chain=${chainId} type=${contractType}`,
        error?.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        error?.response?.data?.message ||
          'Failed to retry contract deployment',
      );
    }
  }
}
