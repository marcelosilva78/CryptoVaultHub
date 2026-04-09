import { Global, Module } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';

@Global()
@Module({
  providers: [AdminDatabaseService],
  exports: [AdminDatabaseService],
})
export class AdminDatabaseModule {}
