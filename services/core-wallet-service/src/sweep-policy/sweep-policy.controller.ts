import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { SweepPolicyService, UpsertPolicyDto } from './sweep-policy.service';

@Controller('sweep-policies')
export class SweepPolicyController {
  constructor(private readonly policy: SweepPolicyService) {}

  @Get(':clientId/:projectId/:chainId')
  async get(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    await this.policy.assertProjectBelongsToClient(projectId, clientId);
    const policy = await this.policy.get(projectId, chainId);
    return { success: true, policy };
  }

  @Get(':clientId/:projectId')
  async listForProject(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    await this.policy.assertProjectBelongsToClient(projectId, clientId);
    const policies = await this.policy.listForProject(projectId);
    return { success: true, policies };
  }

  @Patch(':clientId/:projectId/:chainId')
  async upsert(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: UpsertPolicyDto,
  ) {
    await this.policy.assertProjectBelongsToClient(projectId, clientId);
    const policy = await this.policy.upsert(projectId, chainId, dto);
    return { success: true, policy };
  }
}
