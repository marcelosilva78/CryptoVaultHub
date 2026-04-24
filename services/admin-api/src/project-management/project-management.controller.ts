import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
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
import { ProjectManagementService } from './project-management.service';
import { ProjectContractService } from './project-contract.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  ListProjectsQueryDto,
} from '../common/dto/project.dto';

@ApiTags('Projects')
@ApiBearerAuth('JWT')
@Controller('admin/project-management/projects')
export class ProjectManagementController {
  constructor(
    private readonly projectService: ProjectManagementService,
    private readonly projectContractService: ProjectContractService,
  ) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a new project for a client',
    description: `Creates a new project under the specified client organization.

Each project has a unique slug within its client scope. If \`isDefault\` is set to true, any existing default project for that client will be unset.`,
  })
  @ApiBody({
    type: CreateProjectDto,
    examples: {
      production: {
        summary: 'Production Wallet Project',
        value: {
          clientId: 1,
          name: 'Production Wallet',
          slug: 'production-wallet',
          description: 'Main production wallet for exchange operations',
          isDefault: true,
          settings: { autoSweep: true },
        },
      },
      staging: {
        summary: 'Staging Project',
        value: {
          clientId: 1,
          name: 'Staging Environment',
          slug: 'staging',
          description: 'Staging environment for testing',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Project created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '1',
          clientId: '1',
          name: 'Production Wallet',
          slug: 'production-wallet',
          description: 'Main production wallet for exchange operations',
          isDefault: true,
          status: 'active',
          settings: { autoSweep: true },
          createdAt: '2026-04-09T10:30:00Z',
          updatedAt: '2026-04-09T10:30:00Z',
          client: { id: '1', name: 'Acme Exchange', slug: 'acme-exchange' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid fields' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  @ApiResponse({ status: 409, description: 'Conflict -- project with this slug already exists for the client' })
  async createProject(@Body() dto: CreateProjectDto, @Req() req: Request) {
    const user = (req as any).user;
    const project = await this.projectService.create(
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, data: project };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List projects',
    description: `Returns a paginated list of projects with optional filtering by client ID and status.

Results are ordered by creation date (newest first). **Accessible to all authenticated admin roles.**`,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of projects',
    schema: {
      example: {
        success: true,
        data: {
          items: [
            {
              id: '1',
              clientId: '1',
              name: 'Production Wallet',
              slug: 'production-wallet',
              description: 'Main production wallet',
              isDefault: true,
              status: 'active',
              settings: null,
              createdAt: '2026-04-09T10:30:00Z',
              updatedAt: '2026-04-09T10:30:00Z',
              client: { id: '1', name: 'Acme Exchange', slug: 'acme-exchange' },
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async listProjects(@Query() query: ListProjectsQueryDto) {
    const result = await this.projectService.findAll({
      clientId: query.clientId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
    return { success: true, data: result };
  }

  @Get(':id')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get a project by ID',
    description: `Retrieves the full details of a single project, including its client information.

**Accessible to all authenticated admin roles.**`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the project',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project details retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '1',
          clientId: '1',
          name: 'Production Wallet',
          slug: 'production-wallet',
          description: 'Main production wallet',
          isDefault: true,
          status: 'active',
          settings: null,
          createdAt: '2026-04-09T10:30:00Z',
          updatedAt: '2026-04-09T10:30:00Z',
          client: { id: '1', name: 'Acme Exchange', slug: 'acme-exchange' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getProject(@Param('id', ParseIntPipe) id: number) {
    const project = await this.projectService.findById(id);
    return { success: true, data: project };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update a project',
    description: `Updates one or more fields of an existing project. Only the provided fields are updated; omitted fields remain unchanged.

**Note:** To change the default project, use the dedicated set-default endpoint instead.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the project to update',
    type: 'integer',
    example: 1,
  })
  @ApiBody({
    type: UpdateProjectDto,
    examples: {
      updateName: {
        summary: 'Update project name',
        value: { name: 'Updated Wallet Name' },
      },
      suspendProject: {
        summary: 'Suspend a project',
        value: { status: 'suspended' },
      },
      updateSettings: {
        summary: 'Update settings',
        value: { settings: { autoSweep: false, webhookUrl: 'https://example.com/hook' } },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Project updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '1',
          clientId: '1',
          name: 'Updated Wallet Name',
          slug: 'production-wallet',
          description: 'Main production wallet',
          isDefault: true,
          status: 'active',
          settings: { autoSweep: false },
          createdAt: '2026-04-09T10:30:00Z',
          updatedAt: '2026-04-09T14:00:00Z',
          client: { id: '1', name: 'Acme Exchange', slug: 'acme-exchange' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid field values' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async updateProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const project = await this.projectService.update(
      id,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, data: project };
  }

  @Delete(':id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Archive a project',
    description: `Archives a project by setting its status to "archived". Archived projects are read-only and cannot be used for new operations.

**Restriction:** The default project for a client cannot be archived. You must set another project as default first.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the project to archive',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project archived successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '1',
          clientId: '1',
          name: 'Old Project',
          slug: 'old-project',
          status: 'archived',
          isDefault: false,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot archive the default project' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @HttpCode(HttpStatus.OK)
  async archiveProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const project = await this.projectService.archive(
      id,
      user.userId,
      req.ip,
    );
    return { success: true, data: project };
  }

  @Post(':id/set-default')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a project as the default for its client',
    description: `Sets the specified project as the default project for its client. The previous default project (if any) is automatically unset.

**Restriction:** Archived projects cannot be set as default.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the project to set as default',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project set as default successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '1',
          clientId: '1',
          name: 'Production Wallet',
          slug: 'production-wallet',
          isDefault: true,
          status: 'active',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot set archived project as default' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async setDefaultProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const project = await this.projectService.setDefault(
      id,
      user.userId,
      req.ip,
    );
    return { success: true, data: project };
  }

  // ---------------------------------------------------------------------------
  // Project Contract Deployment
  // ---------------------------------------------------------------------------

  @Post(':id/chains/:chainId/deploy')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Deploy isolated contracts for a project on a chain',
    description: `Triggers deployment of all project-isolated smart contracts (wallet impl, forwarder impl, wallet factory, forwarder factory, hot wallet) for the specified project on the given chain.

Requires a gas tank to be funded and the client ID + signer addresses.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: 'integer',
    example: 1,
  })
  @ApiParam({
    name: 'chainId',
    description: 'Chain ID to deploy on',
    type: 'integer',
    example: 11155111,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['clientId', 'signers'],
      properties: {
        clientId: { type: 'integer', example: 1 },
        signers: {
          type: 'array',
          items: { type: 'string' },
          example: ['0xaaa...', '0xbbb...', '0xccc...'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Deployment triggered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 500, description: 'Deployment failed' })
  async deployProjectContracts(
    @Param('id', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() body: { clientId: number; signers: string[] },
  ) {
    const result = await this.projectContractService.deployProjectContracts(
      projectId,
      chainId,
      body,
    );
    return { success: true, data: result };
  }

  @Get(':id/chains/:chainId/contracts')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get project contract deployment status',
    description: `Returns the deployment status for all contract types of a project on a specific chain. Includes both the overall project chain status and individual contract statuses.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Project ID',
    type: 'integer',
    example: 1,
  })
  @ApiParam({
    name: 'chainId',
    description: 'Chain ID',
    type: 'integer',
    example: 11155111,
  })
  @ApiResponse({ status: 200, description: 'Contract status retrieved' })
  @ApiResponse({ status: 500, description: 'Failed to fetch status' })
  async getProjectContractStatus(
    @Param('id', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    const result = await this.projectContractService.getDeployStatus(
      projectId,
      chainId,
    );
    return { success: true, data: result };
  }

  @Post(':id/chains/:chainId/contracts/:type/retry')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Retry a failed contract deployment',
    description: `Retries a single failed contract deployment for a project on a chain. Only contracts with status "failed" can be retried.`,
  })
  @ApiParam({ name: 'id', description: 'Project ID', type: 'integer' })
  @ApiParam({ name: 'chainId', description: 'Chain ID', type: 'integer' })
  @ApiParam({
    name: 'type',
    description: 'Contract type to retry',
    enum: ['wallet_impl', 'forwarder_impl', 'wallet_factory', 'forwarder_factory'],
  })
  @ApiResponse({ status: 200, description: 'Retry succeeded' })
  @ApiResponse({ status: 400, description: 'Contract is not in failed state' })
  @ApiResponse({ status: 404, description: 'Contract record not found' })
  @ApiResponse({ status: 500, description: 'Retry failed' })
  async retryProjectContractDeploy(
    @Param('id', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Param('type') contractType: string,
  ) {
    const result = await this.projectContractService.retryFailedDeploy(
      projectId,
      chainId,
      contractType,
    );
    return { success: true, data: result };
  }
}
