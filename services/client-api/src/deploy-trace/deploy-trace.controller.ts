import {
  Controller,
  Get,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { DeployTraceService } from './deploy-trace.service';
import { ListDeployTracesQueryDto } from '../common/dto/address-group.dto';

@ApiTags('Deploy Traces')
@ApiSecurity('ApiKey')
@Controller('client/v1/deploy-traces')
export class DeployTraceController {
  constructor(private readonly deployTraceService: DeployTraceService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List deploy traces',
    description: `Returns a paginated list of deployment traces for the authenticated client. Each trace contains full on-chain details: transaction hash, block info, gas costs, deployer address, factory address, salt, and event logs.

**Resource types:**
- \`wallet\` — Hot wallet or gas tank deployment
- \`forwarder\` — Deposit address (forwarder) deployment
- \`factory\` — Factory contract deployment
- \`token_contract\` — Token contract deployment

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Deploy traces retrieved successfully.',
  })
  async listTraces(
    @Query() query: ListDeployTracesQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.deployTraceService.listTraces(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      chainId: query.chainId,
      resourceType: query.resourceType,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get deploy trace details',
    description: `Returns the full details of a deployment trace, including the complete transaction receipt, block information, gas breakdown, event logs, and explorer URL.

**Response includes:**
- \`txHash\` — On-chain transaction hash
- \`blockNumber\` / \`blockHash\` / \`blockTimestamp\` — Block inclusion details
- \`deployerAddress\` — EOA that submitted the deployment
- \`factoryAddress\` — Factory contract used for CREATE2
- \`salt\` / \`initCodeHash\` — CREATE2 parameters for verification
- \`gasUsed\` / \`gasPrice\` / \`gasCostWei\` — Gas breakdown
- \`explorerUrl\` — Direct link to block explorer
- \`eventLogs\` — Raw event logs from the deployment transaction
- \`metadata\` — Additional context (correlation IDs, trigger info)

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Deploy trace ID',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Deploy trace details retrieved.' })
  @ApiResponse({ status: 404, description: 'Deploy trace not found.' })
  async getTrace(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.deployTraceService.getTrace(
      clientId,
      parseInt(id, 10),
    );
    return { success: true, ...result };
  }
}
