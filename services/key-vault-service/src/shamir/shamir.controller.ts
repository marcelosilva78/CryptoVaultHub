import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ShamirService } from './shamir.service';
import { SplitSharesDto, ReconstructDto } from '../common/dto/key-generation.dto';

@Controller('shamir')
export class ShamirController {
  constructor(private readonly shamirService: ShamirService) {}

  @Get(':clientId/status')
  async getStatus(@Param('clientId', ParseIntPipe) clientId: number) {
    const status = await this.shamirService.getShareStatus(clientId);
    return { success: true, ...status };
  }

  @Post(':clientId/split')
  async split(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: SplitSharesDto,
  ) {
    const result = await this.shamirService.splitBackupKey(
      clientId,
      dto.totalShares,
      dto.threshold,
      dto.custodians,
      dto.requestedBy ?? 'system',
    );
    return { success: true, ...result };
  }

  @Post(':clientId/reconstruct')
  async reconstruct(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: ReconstructDto,
  ) {
    const result = await this.shamirService.reconstructBackupKey(
      clientId,
      dto.shareIndices,
      dto.requestedBy ?? 'system',
    );
    return { success: true, clientId, ...result };
  }
}
