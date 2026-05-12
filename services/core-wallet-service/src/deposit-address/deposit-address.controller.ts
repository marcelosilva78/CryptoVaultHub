import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { DepositAddressService } from './deposit-address.service';
import {
  GenerateDepositAddressDto,
  BatchGenerateDepositAddressDto,
} from '../common/dto/deposit-address.dto';

@Controller('deposit-addresses')
export class DepositAddressController {
  constructor(
    private readonly depositAddressService: DepositAddressService,
  ) {}

  @Post('generate')
  async generate(@Body() dto: GenerateDepositAddressDto) {
    const result = await this.depositAddressService.generateAddress(
      dto.clientId,
      dto.chainId,
      dto.externalId,
      dto.label,
    );
    return {
      success: true,
      clientId: dto.clientId,
      chainId: dto.chainId,
      depositAddress: result,
    };
  }

  @Post('batch')
  async generateBatch(@Body() dto: BatchGenerateDepositAddressDto) {
    const results = await this.depositAddressService.generateBatch(
      dto.clientId,
      dto.chainId,
      dto.items,
    );
    return {
      success: true,
      clientId: dto.clientId,
      chainId: dto.chainId,
      count: results.length,
      depositAddresses: results,
    };
  }

  @Get(':clientId')
  async listAddresses(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('chainId') chainId?: string,
  ) {
    const addresses = await this.depositAddressService.listAddresses(
      clientId,
      chainId ? parseInt(chainId, 10) : undefined,
    );
    return {
      success: true,
      clientId,
      count: addresses.length,
      depositAddresses: addresses,
    };
  }

  @Get(':clientId/:id/balances')
  async getDepositAddressBalances(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.depositAddressService.getDepositAddressBalances(
      clientId,
      id,
    );
    return { success: true, ...result };
  }
}
