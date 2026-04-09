import {
  Controller,
  Post,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { SigningService } from './signing.service';
import { SignHashDto, SignBatchDto } from '../common/dto/key-generation.dto';

@Controller('keys')
export class SigningController {
  constructor(private readonly signingService: SigningService) {}

  @Post(':clientId/sign')
  async signHash(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: SignHashDto,
  ) {
    const result = await this.signingService.signHash(
      clientId,
      dto.hash,
      dto.keyType,
      dto.requestedBy ?? 'system',
    );
    return {
      success: true,
      clientId,
      ...result,
    };
  }

  @Post(':clientId/sign-batch')
  async signBatch(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: SignBatchDto,
  ) {
    const results = await this.signingService.signBatch(
      clientId,
      dto.hashes,
      dto.keyType,
      dto.requestedBy ?? 'system',
    );
    return {
      success: true,
      clientId,
      signatures: results,
    };
  }
}
