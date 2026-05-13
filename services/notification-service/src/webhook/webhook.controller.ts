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
  NotFoundException,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { DeadLetterService } from './dead-letter.service';
import { ManualResendService } from './manual-resend.service';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  ManualDeliveryDto,
  TestWebhookDto,
} from '../common/dto/webhook.dto';

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly deliveryService: WebhookDeliveryService,
    private readonly deadLetterService: DeadLetterService,
    private readonly manualResendService: ManualResendService,
  ) {}

  @Post()
  async createWebhook(@Body() dto: CreateWebhookDto) {
    const webhook = await this.webhookService.createWebhook({
      clientId: dto.clientId,
      projectId: dto.projectId,
      url: dto.url,
      events: dto.events,
      label: dto.label,
      isActive: dto.isActive,
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

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testWebhook(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestWebhookDto,
  ) {
    const delivery = await this.deliveryService.testWebhook(
      BigInt(id),
      dto?.clientId !== undefined ? BigInt(dto.clientId) : undefined,
    );
    return { success: true, delivery };
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
      dto.projectId ? BigInt(dto.projectId) : undefined,
    );
    return {
      success: true,
      deliveriesCreated: deliveries.length,
    };
  }

  @Get('deliveries/:id')
  async getDeliveryDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query('clientId') clientId?: string,
  ) {
    const detail = await this.deliveryService.getDeliveryDetail(BigInt(id));
    if (!detail) {
      return { success: false, error: 'Delivery not found' };
    }
    return { success: true, delivery: detail };
  }

  @Post('deliveries/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryDelivery(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { clientId: number },
  ) {
    const delivery = await this.deliveryService.getDeliveryDetail(BigInt(id));
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    // deliverWebhook returns the raw Prisma row whose id/webhookId/clientId
    // are BigInts — serializing them with res.json crashes. Re-read the row
    // through getDeliveryDetail so BigInts are normalized for the response.
    await this.deliveryService.deliverWebhook(
      BigInt(id),
      BigInt(delivery.webhookId),
    );
    const updated = await this.deliveryService.getDeliveryDetail(BigInt(id));
    return { success: true, delivery: updated };
  }

  @Post('deliveries/:id/resend')
  @HttpCode(HttpStatus.OK)
  async resendDelivery(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { clientId: number },
  ) {
    const result = await this.manualResendService.resendDelivery(
      BigInt(id),
      BigInt(body.clientId),
    );
    return { success: true, ...result };
  }

  /**
   * Cross-webhook deliveries listing with filters + pagination. Used by the
   * portal's Delivery Log to power its bulk-resend, filtering and paging UX.
   * The :webhookId-scoped endpoint above remains for backwards compat.
   */
  @Get('deliveries')
  async listDeliveriesForClient(
    @Query('clientId') clientId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('webhookId') webhookId?: string,
    @Query('eventType') eventType?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    if (!clientId) {
      throw new NotFoundException('clientId query param required');
    }
    const parsedFrom = fromDate ? new Date(fromDate) : undefined;
    const parsedTo = toDate ? new Date(toDate) : undefined;
    if (parsedFrom && Number.isNaN(parsedFrom.getTime())) {
      throw new NotFoundException('fromDate is not a valid date');
    }
    if (parsedTo && Number.isNaN(parsedTo.getTime())) {
      throw new NotFoundException('toDate is not a valid date');
    }
    // Bare YYYY-MM-DD widen to end-of-day so the inclusive contract from the
    // deposits endpoint also applies here.
    if (parsedTo && /^\d{4}-\d{2}-\d{2}$/.test(toDate ?? '')) {
      parsedTo.setUTCHours(23, 59, 59, 999);
    }
    const result = await this.deliveryService.listDeliveriesForClient({
      clientId: BigInt(clientId),
      page: page ? parseInt(page, 10) || 1 : 1,
      limit: limit ? parseInt(limit, 10) || 20 : 20,
      status,
      webhookId: webhookId ? parseInt(webhookId, 10) : undefined,
      eventType,
      fromDate: parsedFrom,
      toDate: parsedTo,
    });
    return { success: true, ...result };
  }

  @Post('deliveries/retry-bulk')
  @HttpCode(HttpStatus.OK)
  async retryDeliveriesBulk(
    @Body() body: { clientId: number; ids: Array<number | string> },
  ) {
    if (!body?.clientId || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new NotFoundException('clientId and ids[] are required');
    }
    const result = await this.deliveryService.retryDeliveriesBulk(
      BigInt(body.clientId),
      body.ids.map((id) => BigInt(id)),
    );
    return { success: true, ...result };
  }

  @Get('stats')
  async getDeliveryStats() {
    return this.webhookService.getDeliveryStats();
  }

  @Get('dead-letters')
  async listDeadLetters(
    @Query('clientId') clientId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.deadLetterService.listDeadLetters(
      BigInt(clientId),
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        status,
      },
    );
    return { success: true, ...result };
  }
}
