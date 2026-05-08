import { Module } from '@nestjs/common';
import { DepositPersistenceHandler } from './deposit-persistence.handler';

@Module({
  providers: [DepositPersistenceHandler],
})
export class DepositPersistenceModule {}
