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
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { ExportApiService } from './export.service';
import { CreateExportDto, ListExportsQueryDto } from '../common/dto/export.dto';

@ApiTags('Exports')
@ApiSecurity('ApiKey')
@Controller('client/v1/exports')
export class ExportController {
  constructor(private readonly exportService: ExportApiService) {}

  @Post()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Request a data export',
    description: `Creates an export request for the specified data type and format. Small exports (< 5000 rows) are processed with high priority.

**Supported export types:**
- \`transactions\` -- All transactions
- \`deposits\` -- Deposit history
- \`withdrawals\` -- Withdrawal history
- \`flush_operations\` -- Forwarder flush operations
- \`webhooks\` -- Webhook delivery logs
- \`webhook_failures\` -- Failed webhook deliveries
- \`events\` -- Platform events
- \`balances\` -- Current wallet balances

**Supported formats:** \`csv\`, \`xlsx\`, \`json\`

**Filters:** Optional JSON object with \`status\`, \`chainId\`, \`fromDate\`, \`toDate\`.

**Lifecycle:**
1. Request is created with status \`pending\`
2. Background worker processes the export (\`processing\`)
3. File is generated and available for download (\`completed\`)
4. After 24 hours, the file expires (\`expired\`)

Each export can be downloaded up to 10 times.

**Required scope:** \`read\``,
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
        estimatedRows: { type: 'integer', example: 1250 },
        message: { type: 'string', example: 'Small export queued with high priority' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No data matches the specified filters.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async createExport(@Body() dto: CreateExportDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.exportService.createExportRequest(clientId, {
      exportType: dto.exportType,
      format: dto.format,
      filters: dto.filters,
    });
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List export requests',
    description: `Returns a paginated list of all export requests for the authenticated client, ordered by creation date (newest first).

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Export requests retrieved.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        requests: { type: 'array', items: { type: 'object' } },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 5 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async listExports(@Query() query: ListExportsQueryDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.exportService.listExportRequests(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get export request status',
    description: `Returns the current status and details of a specific export request.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Export request UID.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Export request details.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        request: { type: 'object' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Export request not found.' })
  async getExport(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const request = await this.exportService.getExportRequest(clientId, id);
    return { success: true, request };
  }

  @Get(':id/download')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Download export file',
    description: `Downloads the generated export file. Only available when status is \`completed\`.

**Limits:**
- Maximum 10 downloads per export
- Files expire after 24 hours

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Export request UID.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({ status: 200, description: 'File download stream.' })
  @ApiResponse({ status: 404, description: 'Export file not found or expired.' })
  async downloadExport(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const clientId = (req as any).clientId;
    const stream = await this.exportService.downloadExport(clientId, id);
    stream.pipe(res);
  }
}
