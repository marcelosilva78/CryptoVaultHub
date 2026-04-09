import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTokenDto } from '../common/dto/token.dto';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createToken(dto: CreateTokenDto) {
    const existing = await this.prisma.token.findUnique({
      where: {
        uq_chain_contract: {
          chainId: dto.chainId,
          contractAddress: dto.contractAddress.toLowerCase(),
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Token ${dto.symbol} already exists on chain ${dto.chainId}`,
      );
    }

    const token = await this.prisma.token.create({
      data: {
        chainId: dto.chainId,
        contractAddress: dto.contractAddress.toLowerCase(),
        symbol: dto.symbol,
        name: dto.name,
        decimals: dto.decimals,
        isNative: dto.isNative ?? false,
        isDefault: dto.isDefault ?? true,
        coingeckoId: dto.coingeckoId ?? null,
      },
    });

    this.logger.log(
      `Token created: ${dto.symbol} on chain ${dto.chainId}`,
    );
    return token;
  }

  async listTokens(chainId?: number) {
    return this.prisma.token.findMany({
      where: {
        isActive: true,
        ...(chainId ? { chainId } : {}),
      },
      orderBy: [{ chainId: 'asc' }, { symbol: 'asc' }],
    });
  }

  async getTokenById(tokenId: bigint) {
    return this.prisma.token.findUnique({
      where: { id: tokenId },
    });
  }
}
