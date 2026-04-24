import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectDeployService } from './project-deploy.service';
import { DeployProjectChainDto } from './dto/deploy-project-chain.dto';

/**
 * Internal endpoints for project-isolated contract deployment.
 *
 * Routes:
 * - POST /projects/:projectId/chains/:chainId/deploy       — trigger deployment
 * - GET  /projects/:projectId/chains/:chainId/contracts     — get deployment status
 * - POST /projects/:projectId/chains/:chainId/contracts/:type/retry — retry failed
 */
@Controller('projects')
export class ProjectContractController {
  constructor(
    private readonly projectDeployService: ProjectDeployService,
  ) {}

  /**
   * POST /projects/:projectId/chains/:chainId/deploy
   *
   * Trigger deployment of all contracts for a project on a chain.
   */
  @Post(':projectId/chains/:chainId/deploy')
  async deployProjectContracts(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: DeployProjectChainDto,
  ) {
    const result = await this.projectDeployService.deployProjectChain(
      projectId,
      dto.clientId,
      chainId,
      dto.signers,
    );

    return {
      success: true,
      projectId,
      chainId,
      ...result,
    };
  }

  /**
   * GET /projects/:projectId/chains/:chainId/contracts
   *
   * Get the deployment status for all contract types of a project+chain.
   * Returns both the overall project_chain status and per-contract statuses.
   */
  @Get(':projectId/chains/:chainId/contracts')
  async getDeployStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const status = await this.projectDeployService.getDeployStatus(
      projectId,
      chainId,
    );

    return {
      success: true,
      projectId,
      chainId,
      ...status,
    };
  }

  /**
   * POST /projects/:projectId/chains/:chainId/contracts/:type/retry
   *
   * Retry a single failed contract deployment.
   * The :type param must be one of: wallet_impl, forwarder_impl,
   * wallet_factory, forwarder_factory
   */
  @Post(':projectId/chains/:chainId/contracts/:type/retry')
  async retryFailedDeploy(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Param('type') contractType: string,
  ) {
    const validTypes = [
      'wallet_impl',
      'forwarder_impl',
      'wallet_factory',
      'forwarder_factory',
    ];

    if (!validTypes.includes(contractType)) {
      throw new BadRequestException(
        `Invalid contract type "${contractType}". Must be one of: ${validTypes.join(', ')}`,
      );
    }

    const result = await this.projectDeployService.retryFailedDeploy(
      projectId,
      chainId,
      contractType,
    );

    return {
      success: true,
      projectId,
      chainId,
      ...result,
    };
  }
}
