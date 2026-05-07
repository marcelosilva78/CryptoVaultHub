import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { AddressBookService } from './address-book.service';

@Controller('address-book')
export class AddressBookController {
  constructor(private readonly addressBookService: AddressBookService) {}

  /**
   * GET /address-book?clientId=&page=&limit=&chainId=
   */
  @Get()
  async listAddresses(
    @Query('clientId', ParseIntPipe) clientId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('chainId') chainId?: string,
  ) {
    return this.addressBookService.listAddresses(clientId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      chainId: chainId ? parseInt(chainId, 10) : undefined,
    });
  }

  /**
   * POST /address-book
   * Body: { clientId, address, label?, chainId?, notes? }
   */
  @Post()
  async addAddress(
    @Body()
    body: {
      clientId: number;
      address: string;
      label?: string;
      chainId?: number;
      notes?: string;
    },
  ) {
    return this.addressBookService.addAddress(body);
  }

  /**
   * PATCH /address-book/:id
   * Body: { label?, notes?, clientId? }
   */
  @Patch(':id')
  async updateAddress(
    @Param('id') id: string,
    @Body() body: { label?: string; notes?: string; clientId?: number },
  ) {
    return this.addressBookService.updateAddress(id, body);
  }

  /**
   * DELETE /address-book/:id
   * Body: { clientId? } (optional, forwarded by client-api)
   */
  @Delete(':id')
  async deleteAddress(
    @Param('id') id: string,
    @Body() body?: { clientId?: number },
  ) {
    return this.addressBookService.deleteAddress(id, body?.clientId);
  }
}
