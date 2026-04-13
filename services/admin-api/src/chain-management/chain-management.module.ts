import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainManagementController } from './chain-management.controller';
import { ChainManagementService } from './chain-management.service';
import { ChainDependencyService } from './chain-dependency.service';
import { ChainLifecycleService } from './chain-lifecycle.service';
import { AuditLogService } from '../common/audit-log.service';

@Module({
  controllers: [ChainManagementController],
  providers: [
    ChainManagementService,
    ChainDependencyService,
    ChainLifecycleService,
    AuditLogService,
    {
      provide: 'CHAIN_INDEXER_URL',
      useFactory: (configService: ConfigService) =>
        configService.get<string>('CHAIN_INDEXER_URL', 'http://localhost:3006'),
      inject: [ConfigService],
    },
  ],
  exports: [ChainManagementService],
})
export class ChainManagementModule {}
