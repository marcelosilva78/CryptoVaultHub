import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/api-key.dto';
import { PortalAuth } from '../common/decorators';

@ApiTags('API Keys')
@Controller('client/v1/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @PortalAuth()
  @ApiOperation({
    summary: 'List API keys for the current client (masked)',
  })
  async list(@Req() req: Request) {
    const clientId = (req as any).clientId as number;
    return this.apiKeyService.list(clientId);
  }

  @Post()
  @PortalAuth()
  @ApiOperation({
    summary: 'Create a new API key for a project. Returns the raw key once.',
  })
  async create(@Req() req: Request, @Body() dto: CreateApiKeyDto) {
    const clientId = (req as any).clientId as number;
    return this.apiKeyService.create(clientId, dto);
  }

  @Delete(':id')
  @PortalAuth()
  @ApiOperation({ summary: 'Revoke an API key.' })
  async revoke(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const clientId = (req as any).clientId as number;
    return this.apiKeyService.revoke(clientId, id);
  }
}
