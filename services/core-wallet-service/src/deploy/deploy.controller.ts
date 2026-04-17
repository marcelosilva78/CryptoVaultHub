import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ProjectDeployService } from './project-deploy.service';
import { ProjectDeployTraceService } from './deploy-trace.service';
import { DeployProjectChainDto } from './dto/deploy-project-chain.dto';

@Controller('deploy')
export class DeployController {
  constructor(
    private readonly projectDeployService: ProjectDeployService,
    private readonly traceService: ProjectDeployTraceService,
  ) {}

  /**
   * POST /deploy/project/:projectId/chain/:chainId
   *
   * Trigger deployment of all 5 contracts for a project on a chain.
   * Body: { clientId, signers }
   */
  @Post('project/:projectId/chain/:chainId')
  async deployProjectChain(
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
   * POST /deploy/project/:projectId/register-chain
   *
   * Register a project_chain row with deploy_status='pending'.
   * Called by client-api at project creation to ensure the row exists
   * before deploy is triggered. Idempotent: if the row already exists, returns it.
   */
  @Post('project/:projectId/register-chain')
  async registerProjectChain(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { chainId: number },
  ) {
    const result = await this.projectDeployService.registerProjectChain(
      projectId,
      body.chainId,
    );
    return { success: true, ...result };
  }

  /**
   * GET /deploy/project/:projectId/traces
   *
   * Get all deploy traces for a project.
   */
  @Get('project/:projectId/traces')
  async getTracesByProject(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    const traces = await this.traceService.getTracesByProject(projectId);
    return {
      success: true,
      projectId,
      traces,
    };
  }

  /**
   * GET /deploy/project/:projectId/chain/:chainId/traces
   *
   * Get deploy traces for a specific project + chain.
   */
  @Get('project/:projectId/chain/:chainId/traces')
  async getTracesByProjectChain(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const traces = await this.traceService.getTracesByProjectChain(
      projectId,
      chainId,
    );
    return {
      success: true,
      projectId,
      chainId,
      traces,
    };
  }

  /**
   * GET /deploy/project/:projectId/chain/:chainId/status
   *
   * Get the deployment status for a project + chain.
   */
  @Get('project/:projectId/chain/:chainId/status')
  async getProjectChainStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const status = await this.projectDeployService.getProjectChainStatus(
      projectId,
      chainId,
    );

    if (!status) {
      throw new NotFoundException(
        `ProjectChain not found for project=${projectId} chain=${chainId}`,
      );
    }

    return {
      success: true,
      ...status,
    };
  }
}
