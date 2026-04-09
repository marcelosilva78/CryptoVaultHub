import { Module } from '@nestjs/common';
import { AddressGroupController } from './address-group.controller';
import { AddressGroupService } from './address-group.service';

@Module({
  controllers: [AddressGroupController],
  providers: [AddressGroupService],
  exports: [AddressGroupService],
})
export class AddressGroupModule {}
