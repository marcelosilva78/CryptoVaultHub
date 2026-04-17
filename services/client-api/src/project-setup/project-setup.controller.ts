import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { CreateProjectDto } from '../common/dto/project-setup.dto';
import { ProjectSetupService } from './project-setup.service';

@ApiTags('Project Setup')
@ApiSecurity('ApiKey')
@Controller('client/v1/projects')
export class ProjectSetupController {
  constructor(private readonly setupService: ProjectSetupService) {}

  // ---------------------------------------------------------------------------
  // POST /client/v1/projects/setup
  // ---------------------------------------------------------------------------
  @Post('setup')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Create a new project',
    description: `Creates a new project for the authenticated client with the specified chains and custody mode.

**Custody modes:**
- \`full_custody\` — CryptoVaultHub manages all signing keys (auto-signs both platform and client keys)
- \`co_sign\` — Platform key managed by CVH, client key managed by client (needs co-sign for withdrawals)
- \`client_only\` — Both keys managed by the client

After creation, use the \`/keys\`, \`/gas-check\`, and \`/deploy\` endpoints to complete project setup.

**Required scope:** \`write\``,
  })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        project: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 42 },
            name: { type: 'string', example: 'My DeFi Gateway' },
            slug: { type: 'string', example: 'my-defi-gateway' },
            description: { type: 'string', nullable: true },
            custodyMode: { type: 'string', example: 'full_custody' },
            status: { type: 'string', example: 'active' },
            chains: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  chainId: { type: 'integer', example: 56 },
                  status: { type: 'string', example: 'pending' },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  async createProject(@Body() dto: CreateProjectDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const project = await this.setupService.createProject(clientId, dto);
    return { success: true, project };
  }

  // ---------------------------------------------------------------------------
  // POST /client/v1/projects/:id/keys
  // ---------------------------------------------------------------------------
  @Post(':id/keys')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Initialize project keys (key ceremony)',
    description: `Generates the HD seed (24-word mnemonic), derives platform/client/backup keys, and returns the mnemonic + public keys.

**IMPORTANT:** The mnemonic is shown exactly **once**. Store it securely. It will not be returned again.
After storing the mnemonic, call \`POST /projects/:id/confirm-seed\` to confirm receipt.

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Key ceremony completed. Mnemonic returned once.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        mnemonic: {
          type: 'string',
          example: 'abandon abandon abandon ... about',
          description: '24-word BIP-39 mnemonic. Store securely. Shown only once.',
        },
        publicKeys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              keyType: { type: 'string', example: 'platform' },
              publicKey: { type: 'string', example: '0x04...' },
              address: { type: 'string', example: '0x742d...' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  async initializeKeys(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.initializeKeys(clientId, id);
    return { success: true, ...result };
  }

  // ---------------------------------------------------------------------------
  // POST /client/v1/projects/:id/confirm-seed
  // ---------------------------------------------------------------------------
  @Post(':id/confirm-seed')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Confirm seed phrase has been saved',
    description: `Marks the seed phrase as shown to the client. Call this endpoint **after** the user has confirmed they have securely stored their mnemonic.

This is a one-way flag and cannot be undone.

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Seed confirmed as shown.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        confirmed: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async confirmSeed(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.confirmSeedShown(clientId, id);
    return { success: true, ...result };
  }

  // ---------------------------------------------------------------------------
  // GET /client/v1/projects/:id/gas-check
  // ---------------------------------------------------------------------------
  @Get(':id/gas-check')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Check gas tank balances for deploy',
    description: `Returns the gas tank balance and estimated required gas for each chain in the project. Use this before \`/deploy\` to verify sufficient funding.

Estimated gas per chain: ~5.65M gas units (5 contract deployments).

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Gas check results.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        allSufficient: { type: 'boolean', example: true },
        chains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 56 },
              chainName: { type: 'string', example: 'BSC' },
              gasTankAddress: { type: 'string', example: '0x...' },
              balanceWei: { type: 'string', example: '500000000000000000' },
              balanceFormatted: { type: 'string', example: '0.5000' },
              requiredWei: { type: 'string', example: '113000000000000000' },
              requiredFormatted: { type: 'string', example: '0.1130' },
              sufficient: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async checkGas(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.checkGasBalance(clientId, id);
    return { success: true, ...result };
  }

  // ---------------------------------------------------------------------------
  // POST /client/v1/projects/:id/deploy
  // ---------------------------------------------------------------------------
  @Post(':id/deploy')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Start contract deployment',
    description: `Triggers the deployment of all 5 contracts (wallet impl, forwarder impl, wallet factory, forwarder factory, hot wallet) on each chain.

**Prerequisites:**
1. Keys must be initialized (\`POST /projects/:id/keys\`)
2. Gas tanks must be funded (\`GET /projects/:id/gas-check\` to verify)

Deployment may take several minutes per chain. Use \`GET /projects/:id/deploy/status\` to track progress.

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Deployment started/completed.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        projectId: { type: 'integer', example: 42 },
        allDeployed: { type: 'boolean', example: true },
        deploys: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 56 },
              chainName: { type: 'string', example: 'BSC' },
              status: { type: 'string', example: 'deployed' },
              error: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Insufficient gas or keys not initialized.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async startDeploy(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.startDeploy(clientId, id);
    return { success: true, ...result };
  }

  // ---------------------------------------------------------------------------
  // GET /client/v1/projects/:id/deploy/status
  // ---------------------------------------------------------------------------
  @Get(':id/deploy/status')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get deployment status per chain',
    description: `Returns the current deploy status and contract addresses for each chain in the project.

**Deploy statuses:**
- \`not_started\` — Chain registered but deploy not triggered
- \`pending\` — Deploy record exists, waiting to start
- \`deploying\` — Contracts being deployed
- \`ready\` — All 5 contracts deployed and verified
- \`failed\` — Deploy failed (check deployError field)

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Deploy status retrieved.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        projectId: { type: 'integer', example: 42 },
        chains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 56 },
              status: { type: 'string', example: 'ready' },
              deployStartedAt: { type: 'string', format: 'date-time', nullable: true },
              deployCompletedAt: { type: 'string', format: 'date-time', nullable: true },
              deployError: { type: 'string', nullable: true },
              contracts: {
                type: 'object',
                properties: {
                  walletFactory: { type: 'string', nullable: true },
                  forwarderFactory: { type: 'string', nullable: true },
                  walletImpl: { type: 'string', nullable: true },
                  forwarderImpl: { type: 'string', nullable: true },
                  hotWallet: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async getDeployStatus(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.getDeployStatus(clientId, id);
    return { success: true, ...result };
  }

  // ---------------------------------------------------------------------------
  // GET /client/v1/projects/:id/deploy/traces
  // ---------------------------------------------------------------------------
  @Get(':id/deploy/traces')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get all deploy traces for a project',
    description: `Returns the full on-chain deployment audit trail for all chains in the project. Each trace includes calldata, signed transaction, RPC request/response, ABI, gas costs, and verification proof.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Deploy traces retrieved.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        projectId: { type: 'integer', example: 42 },
        traces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              chainId: { type: 'integer' },
              contractType: { type: 'string', example: 'wallet_factory' },
              contractAddress: { type: 'string', nullable: true },
              txHash: { type: 'string', nullable: true },
              status: { type: 'string', example: 'confirmed' },
              gasUsed: { type: 'string', nullable: true },
              gasCostWei: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async getDeployTraces(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.getDeployTraces(clientId, id);
    return { success: true, ...result };
  }

  // ---------------------------------------------------------------------------
  // GET /client/v1/projects/:id/export
  // ---------------------------------------------------------------------------
  @Get(':id/export')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Export full project data',
    description: `Exports the complete project data for portability: public keys, contract addresses, ABIs, deploy traces, and forwarder list.

**Note:** The seed phrase is NOT included in the export. The client should already have it from the initial key ceremony.

The response is a JSON object suitable for download.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Project export data.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        export: {
          type: 'object',
          properties: {
            exportVersion: { type: 'string', example: '1.0' },
            exportedAt: { type: 'string', format: 'date-time' },
            project: { type: 'object' },
            publicKeys: { type: 'object' },
            chains: { type: 'object' },
            abis: { type: 'object' },
            deployTraces: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async exportProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.exportProject(clientId, id);
    return { success: true, export: result };
  }

  // ---------------------------------------------------------------------------
  // GET /client/v1/projects/:id/deploy/traces/:chainId
  // ---------------------------------------------------------------------------
  @Get(':id/deploy/traces/:chainId')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get deploy traces for a specific chain',
    description: `Returns the deployment audit trail filtered by chain ID. Includes all 5 contract deployment traces for the specified chain.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID.',
    example: 42,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'The chain ID to filter traces for.',
    example: 56,
  })
  @ApiResponse({
    status: 200,
    description: 'Deploy traces for chain retrieved.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        projectId: { type: 'integer', example: 42 },
        chainId: { type: 'integer', example: 56 },
        traces: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client.' })
  async getDeployTracesForChain(
    @Param('id', ParseIntPipe) id: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.setupService.getDeployTraces(clientId, id, chainId);
    return { success: true, ...result };
  }
}
