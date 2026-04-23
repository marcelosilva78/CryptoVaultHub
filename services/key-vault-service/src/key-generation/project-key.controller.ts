import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ProjectKeyService } from './project-key.service';
import {
  GenerateProjectKeysDto,
  DeriveProjectGasTankDto,
} from '../common/dto/key-generation.dto';

@Controller('projects')
export class ProjectKeyController {
  constructor(private readonly projectKeyService: ProjectKeyService) {}

  @Post(':projectId/generate-seed')
  async generateSeed(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body('requestedBy') requestedBy?: string,
  ) {
    const result = await this.projectKeyService.generateProjectSeed(
      projectId,
      requestedBy ?? 'system',
    );
    return {
      success: true,
      projectId: result.projectId,
      mnemonic: result.mnemonic,
    };
  }

  @Post(':projectId/generate-keys')
  async generateKeys(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: GenerateProjectKeysDto,
  ) {
    const keys = await this.projectKeyService.generateProjectKeys(
      projectId,
      dto.clientId,
      dto.custodyMode,
      dto.requestedBy ?? 'system',
    );
    return {
      success: true,
      projectId,
      clientId: dto.clientId,
      keys,
    };
  }

  @Post(':projectId/derive-gas-tank-key')
  async deriveGasTankKey(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: DeriveProjectGasTankDto,
  ) {
    const key = await this.projectKeyService.deriveProjectGasTankKey(
      projectId,
      dto.clientId,
      dto.chainId,
      dto.requestedBy ?? 'system',
    );
    return {
      success: true,
      projectId,
      clientId: dto.clientId,
      chainId: dto.chainId,
      key,
    };
  }

  @Post(':projectId/mark-seed-shown')
  async markSeedShown(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    const result = await this.projectKeyService.markSeedShown(projectId);
    return {
      success: true,
      ...result,
    };
  }

  @Get(':projectId/public-keys')
  async getPublicKeys(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    const keys = await this.projectKeyService.getProjectPublicKeys(projectId);
    return {
      success: true,
      projectId,
      keys,
    };
  }
}
