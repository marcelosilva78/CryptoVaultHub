import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientAuth } from '../common/decorators';
import { AddressBookService } from './address-book.service';
import {
  AddAddressDto,
  UpdateAddressDto,
  ListAddressesQueryDto,
} from '../common/dto/address-book.dto';

@Controller('client/v1/addresses')
export class AddressBookController {
  constructor(private readonly addressBookService: AddressBookService) {}

  @Post()
  @ClientAuth('write')
  async addAddress(@Body() dto: AddAddressDto, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.addressBookService.addAddress(clientId, dto);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  async listAddresses(
    @Query() query: ListAddressesQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressBookService.listAddresses(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      chainId: query.chainId,
    });
    return { success: true, ...result };
  }

  @Patch(':id')
  @ClientAuth('write')
  async updateAddress(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressBookService.updateAddress(
      clientId,
      id,
      dto,
    );
    return { success: true, ...result };
  }

  @Delete(':id')
  @ClientAuth('write')
  async disableAddress(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    await this.addressBookService.disableAddress(clientId, id);
    return { success: true, message: 'Address disabled' };
  }
}
