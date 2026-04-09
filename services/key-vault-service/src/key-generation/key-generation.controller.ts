import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { KeyGenerationService } from './key-generation.service';
import { GenerateKeysDto, DeriveGasTankDto } from '../common/dto/key-generation.dto';

@Controller('keys')
export class KeyGenerationController {
  constructor(private readonly keyGenService: KeyGenerationService) {}

  @Post('generate')
  async generateKeys(@Body() dto: GenerateKeysDto) {
    const keys = await this.keyGenService.generateClientKeys(
      dto.clientId,
      dto.requestedBy ?? 'system',
    );
    return {
      success: true,
      clientId: dto.clientId,
      keys,
    };
  }

  @Post('derive-gas-tank')
  async deriveGasTank(@Body() dto: DeriveGasTankDto) {
    const key = await this.keyGenService.deriveGasTankKey(
      dto.clientId,
      dto.chainId,
      dto.requestedBy ?? 'system',
    );
    return {
      success: true,
      clientId: dto.clientId,
      chainId: dto.chainId,
      key,
    };
  }

  @Get(':clientId/public')
  async getPublicKeys(@Param('clientId', ParseIntPipe) clientId: number) {
    const keys = await this.keyGenService.getPublicKeys(clientId);
    return {
      success: true,
      clientId,
      keys,
    };
  }
}
