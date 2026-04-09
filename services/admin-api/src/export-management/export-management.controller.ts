import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { ExportManagementService } from './export-management.service';

@ApiTags('Export Management')
@ApiBearerAuth('JWT')
@Controller('admin/exports')
export class ExportManagementController {
  constructor(
    private readonly exportService: ExportManagementService,
  ) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create an admin export request',
    description: `Creates a data export request with cross-client access. Admin exports can include data from all clients or a specific client.

**Required role:** \`super_admin\` or \`admin\``,
  })
  @ApiResponse({
    status: 201,
    description: 'Export request created.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        requestUid: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
        status: { type: 'string', example: 'pending' },
        estimatedRows: { type: 'integer', example: 15000 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createExport(@Body() body: any, @Req() req: Request) {
    const user = (req as any).user;
    const result = await this.exportService.createExportRequest(
      Number(user.userId),
      {
        exportType: body.exportType,
        format: body.format,
        filters: body.filters,
        clientId: body.clientId,
      },
    );
    return { success: true, ...result };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List all export requests',
    description: `Returns a paginated list of all export requests across all clients. Supports filtering by clientId.

**Required role:** Any admin role`,
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'clientId', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Export requests retrieved.',
  })
  async listExports(@Query() query: any) {
    const result = await this.exportService.listExportRequests({
      page: parseInt(query.page as string) || 1,
      limit: parseInt(query.limit as string) || 20,
      clientId: query.clientId ? parseInt(query.clientId as string) : undefined,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get export request details',
    description: 'Returns the details of a specific export request.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Export request UID' })
  @ApiResponse({ status: 200, description: 'Export request details.' })
  @ApiResponse({ status: 404, description: 'Export request not found.' })
  async getExport(@Param('id') id: string) {
    const request = await this.exportService.getExportRequest(id);
    return { success: true, request };
  }

  @Get(':id/download')
  @AdminAuth()
  @ApiOperation({
    summary: 'Download export file',
    description: 'Downloads the generated export file (admin access -- no client restriction).',
  })
  @ApiParam({ name: 'id', type: String, description: 'Export request UID' })
  @ApiResponse({ status: 200, description: 'File download stream.' })
  @ApiResponse({ status: 404, description: 'Export file not found or expired.' })
  async downloadExport(@Param('id') id: string, @Res() res: Response) {
    const stream = await this.exportService.downloadExport(id);
    stream.pipe(res);
  }
}
