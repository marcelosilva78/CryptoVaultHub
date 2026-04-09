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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientAuth } from '../common/decorators';
import { WebhookService } from './webhook.service';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  ListWebhooksQueryDto,
  ListDeliveriesQueryDto,
} from '../common/dto/webhook.dto';

@Controller('client/v1/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ClientAuth('write')
  async createWebhook(@Body() dto: CreateWebhookDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.createWebhook(clientId, dto);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  async listWebhooks(
    @Query() query: ListWebhooksQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.listWebhooks(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { success: true, ...result };
  }

  @Patch(':id')
  @ClientAuth('write')
  async updateWebhook(
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.updateWebhook(clientId, id, dto);
    return { success: true, ...result };
  }

  @Delete(':id')
  @ClientAuth('write')
  async deleteWebhook(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    await this.webhookService.deleteWebhook(clientId, id);
    return { success: true, message: 'Webhook deleted' };
  }

  @Post(':id/test')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  async testWebhook(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.testWebhook(clientId, id);
    return { success: true, ...result };
  }

  @Get(':id/deliveries')
  @ClientAuth('read')
  async listDeliveries(
    @Param('id') id: string,
    @Query() query: ListDeliveriesQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.listDeliveries(clientId, id, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
    return { success: true, ...result };
  }

  @Post('deliveries/:id/retry')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  async retryDelivery(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.webhookService.retryDelivery(clientId, id);
    return { success: true, ...result };
  }
}
