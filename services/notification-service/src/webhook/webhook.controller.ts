import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  ManualDeliveryDto,
} from '../common/dto/webhook.dto';

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly deliveryService: WebhookDeliveryService,
  ) {}

  @Post()
  async createWebhook(@Body() dto: CreateWebhookDto) {
    const webhook = await this.webhookService.createWebhook({
      clientId: dto.clientId,
      url: dto.url,
      events: dto.events,
    });
    return { success: true, webhook };
  }

  @Get('client/:clientId')
  async listWebhooks(@Param('clientId', ParseIntPipe) clientId: number) {
    const webhooks = await this.webhookService.listWebhooks(clientId);
    return { success: true, count: webhooks.length, webhooks };
  }

  @Patch(':id')
  async updateWebhook(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWebhookDto,
  ) {
    const webhook = await this.webhookService.updateWebhook(id, dto);
    return { success: true, webhook };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(@Param('id', ParseIntPipe) id: number) {
    await this.webhookService.deleteWebhook(id);
  }

  @Get(':id/deliveries')
  async listDeliveries(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
  ) {
    const deliveries = await this.deliveryService.listDeliveries(id, status);
    return { success: true, count: deliveries.length, deliveries };
  }

  @Post('deliver')
  async manualDelivery(@Body() dto: ManualDeliveryDto) {
    const deliveries = await this.deliveryService.createDeliveries(
      BigInt(dto.clientId),
      dto.eventType,
      dto.payload,
    );
    return {
      success: true,
      deliveriesCreated: deliveries.length,
    };
  }
}
