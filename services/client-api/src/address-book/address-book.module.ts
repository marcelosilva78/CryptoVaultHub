import { Module } from '@nestjs/common';
import { AddressBookController } from './address-book.controller';
import { AddressBookService } from './address-book.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [AddressBookController],
  providers: [AddressBookService],
  exports: [AddressBookService],
})
export class AddressBookModule {}
