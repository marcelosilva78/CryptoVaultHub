import {
  Controller,
  Get,
  Param,
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
  ApiHeader,
} from '@nestjs/swagger';
import { ClientAuth, ClientAuthWithProject } from '../common/decorators';
import { ProjectService } from './project.service';

@ApiTags('Projects')
@ApiSecurity('ApiKey')
@Controller('client/v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List client projects',
    description: `Returns all projects belonging to the authenticated client, ordered by default status and creation date.

**Project statuses:**
- \`active\` — Available for use
- \`archived\` — Read-only, no longer accepting new transactions
- \`suspended\` — Disabled by an administrator (hidden from this list)

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Projects retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        projects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1', description: 'Project ID' },
              name: { type: 'string', example: 'My Payment Gateway', description: 'Project name' },
              slug: { type: 'string', example: 'my-payment-gateway', description: 'URL-safe project slug' },
              description: { type: 'string', example: 'Main payment processing project', nullable: true },
              isDefault: { type: 'boolean', example: true, description: 'Whether this is the default project' },
              status: { type: 'string', example: 'active', enum: ['active', 'archived'] },
              settings: { type: 'object', nullable: true, description: 'Project-specific settings JSON' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listProjects(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const projects = await this.projectService.listProjects(clientId);
    return { success: true, projects };
  }

  @Get('current')
  @ClientAuthWithProject('read')
  @ApiOperation({
    summary: 'Get current project',
    description: `Returns the project that is currently active for this request, as resolved from the \`X-Project-Id\` header.

If the client has only one active project, it is auto-selected and no header is needed. If the client has multiple projects and the header is absent, a 400 response is returned with the available project list.

**Required scope:** \`read\``,
  })
  @ApiHeader({
    name: 'X-Project-Id',
    description: 'Project ID to scope the request to. Optional if the client has exactly one active project.',
    required: false,
    schema: { type: 'integer', example: 1 },
  })
  @ApiResponse({
    status: 200,
    description: 'Current project retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        project: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '1' },
            name: { type: 'string', example: 'My Payment Gateway' },
            slug: { type: 'string', example: 'my-payment-gateway' },
            description: { type: 'string', nullable: true },
            isDefault: { type: 'boolean', example: true },
            status: { type: 'string', example: 'active' },
            settings: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Multiple projects found — specify X-Project-Id header.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'Project does not belong to client or is not active.' })
  async getCurrentProject(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const projectId = (req as any).projectId;
    const cachedProject = (req as any).__projectCache;
    const project = await this.projectService.getCurrentProject(
      clientId,
      projectId,
      cachedProject,
    );
    return { success: true, project };
  }

  @Get(':id')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get project details',
    description: `Returns detailed information about a specific project belonging to the authenticated client.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'The project ID to retrieve.',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Project retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        project: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '1' },
            name: { type: 'string', example: 'My Payment Gateway' },
            slug: { type: 'string', example: 'my-payment-gateway' },
            description: { type: 'string', nullable: true },
            isDefault: { type: 'boolean', example: true },
            status: { type: 'string', example: 'active' },
            settings: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'Project not found.' })
  async getProject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const project = await this.projectService.getProject(clientId, id);
    return { success: true, project };
  }
}
