import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
  ApiBody,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { NotificationRulesService } from './notification-rules.service';

@ApiTags('Notification Rules')
@ApiSecurity('ApiKey')
@Controller('client/v1/notifications/rules')
export class NotificationRulesController {
  constructor(private readonly service: NotificationRulesService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List notification rules',
    description:
      'Returns all active notification rules for the authenticated client.',
  })
  @ApiResponse({ status: 200, description: 'Notification rules list' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async listRules(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.service.listRules(clientId);
    return { success: true, ...result };
  }

  @Post()
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Create a notification rule',
    description:
      'Creates a new notification rule for the authenticated client.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'eventType'],
      properties: {
        name: { type: 'string', example: 'Large deposit alert' },
        eventType: {
          type: 'string',
          example: 'deposit.confirmed',
          description:
            'Event type to trigger on (deposit.confirmed, withdrawal.submitted, etc.)',
        },
        conditionType: {
          type: 'string',
          example: 'threshold',
          enum: ['always', 'threshold', 'regex'],
        },
        conditionValue: {
          type: 'string',
          example: '10000',
          nullable: true,
        },
        deliveryMethod: {
          type: 'string',
          example: 'email',
          enum: ['email', 'webhook', 'slack'],
        },
        deliveryTarget: {
          type: 'string',
          example: 'alerts@mycompany.com',
          nullable: true,
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Notification rule created' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async createRule(
    @Body()
    dto: {
      name: string;
      eventType: string;
      conditionType?: string;
      conditionValue?: string;
      deliveryMethod?: string;
      deliveryTarget?: string;
    },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.service.createRule(clientId, dto);
    return { success: true, ...result };
  }

  @Put(':id')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Update a notification rule',
    description:
      'Updates an existing notification rule. Only provided fields are modified.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Rule ID' })
  @ApiResponse({ status: 200, description: 'Notification rule updated' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      name?: string;
      eventType?: string;
      conditionType?: string;
      conditionValue?: string;
      deliveryMethod?: string;
      deliveryTarget?: string;
      isEnabled?: boolean;
    },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.service.updateRule(clientId, id, dto);
    return { success: true, ...result };
  }

  @Delete(':id')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Delete a notification rule (soft-delete)',
    description: 'Soft-deletes a notification rule by setting deleted_at.',
  })
  @ApiParam({ name: 'id', type: Number, description: 'Rule ID' })
  @ApiResponse({ status: 200, description: 'Notification rule deleted' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  async deleteRule(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    await this.service.deleteRule(clientId, id);
    return { success: true, message: 'Notification rule deleted' };
  }
}
