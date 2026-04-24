import { Module } from '@nestjs/common';
import { ProjectDeployService } from './project-deploy.service';
import { ProjectDeployTraceService } from './deploy-trace.service';
import { DeployController } from './deploy.controller';
import { ProjectContractController } from './project-contract.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [BlockchainModule],
  controllers: [DeployController, ProjectContractController],
  providers: [ProjectDeployService, ProjectDeployTraceService],
  exports: [ProjectDeployService, ProjectDeployTraceService],
})
export class DeployModule {}
