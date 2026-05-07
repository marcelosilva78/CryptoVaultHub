import { Module } from '@nestjs/common';
import { AddressBookService } from './address-book.service';
import { AddressBookController } from './address-book.controller';

@Module({
  controllers: [AddressBookController],
  providers: [AddressBookService],
  exports: [AddressBookService],
})
export class AddressBookModule {}
