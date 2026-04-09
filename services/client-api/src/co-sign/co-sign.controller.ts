import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientAuth } from '../common/decorators';
import { CoSignService } from './co-sign.service';

@Controller('client/v1/co-sign')
export class CoSignController {
  constructor(private readonly coSignService: CoSignService) {}

  @Post('pending')
  @ClientAuth('read')
  @HttpCode(HttpStatus.OK)
  async listPending(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const operations = await this.coSignService.listPending(clientId);
    return { success: true, operations };
  }

  @Post(':operationId/sign')
  @ClientAuth('write')
  @HttpCode(HttpStatus.OK)
  async submitSignature(
    @Param('operationId') operationId: string,
    @Body() body: { signature: string; publicKey?: string },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.coSignService.submitSignature(
      clientId,
      operationId,
      body,
    );
    return { success: true, ...result };
  }
}
