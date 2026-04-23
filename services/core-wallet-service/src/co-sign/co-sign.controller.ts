import { Controller, Get, Post, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CoSignOrchestratorService } from './co-sign-orchestrator.service';
import { SubmitCoSignatureDto } from './dto/co-sign.dto';

@Controller('co-sign')
export class CoSignController {
  constructor(private readonly coSign: CoSignOrchestratorService) {}

  @Get('pending')
  async getPending(
    @Query('clientId', ParseIntPipe) clientId: number,
    @Query('projectId', ParseIntPipe) projectId: number,
  ) {
    const operations = await this.coSign.getPendingOperations(clientId, projectId);
    return { operations };
  }

  @Get(':operationId')
  async getOperation(
    @Param('operationId') operationId: string,
    @Query('clientId', ParseIntPipe) clientId: number,
  ) {
    return this.coSign.getOperation(operationId, clientId);
  }

  @Post(':operationId/sign')
  async sign(
    @Param('operationId') operationId: string,
    @Body() body: SubmitCoSignatureDto,
  ) {
    return this.coSign.submitCoSignature(operationId, body.clientId, body.signature);
  }

  @Post('expire-stale')
  async expireStale() {
    const count = await this.coSign.expireStaleOperations();
    return { expired: count };
  }
}
