import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { SweepModule } from './sweep/sweep.module';
import { ForwarderDeployModule } from './forwarder-deploy/forwarder-deploy.module';
import { GasTankModule } from './gas-tank/gas-tank.module';
import { SanctionsListSyncModule } from './sanctions-list-sync/sanctions-list-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    BlockchainModule,
    SweepModule,
    ForwarderDeployModule,
    GasTankModule,
    SanctionsListSyncModule,
  ],
})
export class AppModule {}
