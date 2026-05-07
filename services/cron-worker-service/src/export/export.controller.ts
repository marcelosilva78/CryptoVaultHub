import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  HttpException,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
// Avoid @types/express dependency — http.ServerResponse covers the surface we use.
import type { ServerResponse } from 'http';
import * as fs from 'fs';
import { ExportService, CreateExportRequest } from './export.service';

@Controller('exports')
export class ExportController {
  private readonly logger = new Logger(ExportController.name);

  constructor(private readonly service: ExportService) {}

  /**
   * GET /exports?clientId=&page=&limit=
   * List export requests for a client with pagination.
   * Response shape: { exports: [...], meta: { total, page, limit } }
   */
  @Get()
  async list(
    @Query('clientId', new DefaultValuePipe(0), ParseIntPipe) clientId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(limit, 100);
    const { requests, total } = await this.service.listExportRequests(
      clientId || undefined,
      page,
      safeLimit,
    );

    return {
      exports: requests,
      meta: { total, page, limit: safeLimit },
    };
  }

  /**
   * POST /exports
   * Create a new export request and enqueue it.
   * Body: { clientId, projectId, requestedBy, isAdminExport, exportType, format, filters }
   */
  @Post()
  async create(@Body() body: CreateExportRequest) {
    return this.service.createExportRequest(body);
  }

  /**
   * GET /exports/:id
   * Get a single export request by UID.
   * Optional query param: clientId (scopes access to client's own exports).
   */
  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('clientId', new DefaultValuePipe(0), ParseIntPipe) clientId: number,
  ) {
    const result = await this.service.getExportRequest(id, clientId || undefined);
    if (!result) {
      throw new HttpException('Export not found', HttpStatus.NOT_FOUND);
    }
    return result;
  }

  /**
   * GET /exports/:id/download
   * Stream the completed export file to the response.
   * Header: x-client-id (used to scope access).
   */
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Res() res: ServerResponse,
    @Query('clientId', new DefaultValuePipe(0), ParseIntPipe) clientId: number,
  ) {
    const fileInfo = await this.service.recordDownload(id, clientId || undefined);

    if (!fileInfo) {
      throw new HttpException(
        'Export not found, not completed, expired, or download limit reached',
        HttpStatus.NOT_FOUND,
      );
    }

    const { filePath, fileName } = fileInfo;

    if (!fs.existsSync(filePath)) {
      this.logger.error(`Export file missing on disk: ${filePath}`);
      throw new HttpException('Export file not found on disk', HttpStatus.NOT_FOUND);
    }

    const stat = fs.statSync(filePath);
    const ext = filePath.split('.').pop() ?? 'bin';

    const mimeTypes: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      this.logger.error(`Stream error for ${filePath}: ${err.message}`);
      if (!res.headersSent) {
        res.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        res.end();
      }
    });
    stream.pipe(res);
  }
}
