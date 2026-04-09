import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChainDto } from '../common/dto/chain.dto';

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createChain(dto: CreateChainDto) {
    const existing = await this.prisma.chain.findUnique({
      where: { id: dto.chainId },
    });
    if (existing) {
      throw new ConflictException(
        `Chain ${dto.chainId} already exists`,
      );
    }

    const chain = await this.prisma.chain.create({
      data: {
        id: dto.chainId,
        name: dto.name,
        shortName: dto.shortName,
        nativeCurrencySymbol: dto.nativeCurrencySymbol,
        nativeCurrencyDecimals: dto.nativeCurrencyDecimals,
        rpcEndpoints: dto.rpcEndpoints,
        blockTimeSeconds: dto.blockTimeSeconds,
        confirmationsDefault: dto.confirmationsDefault,
        walletFactoryAddress: dto.walletFactoryAddress ?? null,
        forwarderFactoryAddress: dto.forwarderFactoryAddress ?? null,
        walletImplAddress: dto.walletImplAddress ?? null,
        forwarderImplAddress: dto.forwarderImplAddress ?? null,
        explorerUrl: dto.explorerUrl ?? null,
        gasPriceStrategy: dto.gasPriceStrategy ?? 'eip1559',
        isTestnet: dto.isTestnet ?? false,
      },
    });

    this.logger.log(`Chain created: ${dto.chainId} (${dto.name})`);
    return chain;
  }

  async listChains() {
    return this.prisma.chain.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async getChain(chainId: number) {
    return this.prisma.chain.findUnique({
      where: { id: chainId },
    });
  }
}
