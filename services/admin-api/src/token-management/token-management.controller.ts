import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
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
import { TokenManagementService } from './token-management.service';

@ApiTags('Client Tokens')
@ApiBearerAuth('JWT')
@Controller('admin/clients/:clientId/tokens')
export class TokenManagementController {
  constructor(private readonly tokenService: TokenManagementService) {}

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List enabled tokens for a client',
    description: `Returns all token configurations for the specified client, including enabled/disabled tokens with their settings.`,
  })
  @ApiParam({
    name: 'clientId',
    description: 'Unique numeric identifier of the client organization',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'List of client token configurations',
    schema: {
      example: {
        success: true,
        tokens: [
          {
            id: 1,
            clientId: 1,
            tokenId: 3,
            isEnabled: true,
            customLabel: 'USDT on Ethereum',
            createdAt: '2026-04-14T10:00:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async listClientTokens(
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    const tokens = await this.tokenService.listClientTokens(clientId);
    return { success: true, tokens };
  }

  @Post()
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enable a token for a client',
    description: `Enables a specific token for the client. If the token was previously disabled, it will be re-enabled.`,
  })
  @ApiParam({
    name: 'clientId',
    description: 'Unique numeric identifier of the client organization',
    type: 'integer',
    example: 1,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tokenId'],
      properties: {
        tokenId: { type: 'integer', description: 'Token ID to enable', example: 3 },
        chainId: { type: 'integer', description: 'Chain ID (informational)', example: 1 },
        customLabel: { type: 'string', description: 'Optional custom label', example: 'USDT on Ethereum' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Token enabled for client',
    schema: {
      example: {
        success: true,
        token: {
          id: 1,
          clientId: 1,
          tokenId: 3,
          isEnabled: true,
          customLabel: 'USDT on Ethereum',
          createdAt: '2026-04-14T10:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 409, description: 'Token already enabled for this client' })
  async enableToken(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() body: { tokenId: number; chainId?: number; customLabel?: string },
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const token = await this.tokenService.enableToken(
      clientId,
      body,
      user.userId,
      req.ip,
    );
    return { success: true, token };
  }

  @Delete(':tokenId')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disable a token for a client',
    description: `Disables a specific token for the client. The record is preserved but marked as disabled.`,
  })
  @ApiParam({
    name: 'clientId',
    description: 'Unique numeric identifier of the client organization',
    type: 'integer',
    example: 1,
  })
  @ApiParam({
    name: 'tokenId',
    description: 'Token ID to disable',
    type: 'integer',
    example: 3,
  })
  @ApiResponse({ status: 204, description: 'Token disabled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Token not configured for this client' })
  async disableToken(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('tokenId', ParseIntPipe) tokenId: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    await this.tokenService.disableToken(
      clientId,
      tokenId,
      user.userId,
      req.ip,
    );
  }
}
