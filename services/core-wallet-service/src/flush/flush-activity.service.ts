import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

interface FlushActivityParams {
  limit: number;
}

/**
 * Aggregates the real on-chain "flush" activity for a client by reading the
 * gas-tank transaction ledger and joining it back to the deposit rows that
 * were marked swept via the same tx hash.
 *
 * The legacy `flush_operations` table is intentionally not consulted —
 * production has no automated writer for it (only the on-demand POST /flush
 * path touches it), so leaning on it would produce an empty UI even when the
 * sweep cron has moved real funds. The `gas_tank_transactions` rows with
 * operation_type IN ('sweep', 'deploy_forwarder') are the authoritative
 * ledger and they always have tx hash, block, gas cost, status, and
 * timestamps populated by the cron worker.
 */
@Injectable()
export class FlushActivityService {
  private readonly logger = new Logger(FlushActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async list(clientId: number, params: FlushActivityParams) {
    const limit = Math.max(1, Math.min(200, params.limit));

    // Resolve gas-tank wallet ids for the client. Sweeps and deploys are
    // signed by the gas-tank key, so wallet_type='gas_tank' is the join key.
    const gasTanks = await this.prisma.wallet.findMany({
      where: { clientId: BigInt(clientId), walletType: 'gas_tank' },
      select: { id: true, chainId: true, address: true },
    });
    if (gasTanks.length === 0) {
      return { activity: [], meta: { count: 0 } };
    }
    const walletIds = gasTanks.map((g) => g.id);
    const walletById = new Map(gasTanks.map((g) => [g.id.toString(), g]));

    const txs = await this.prisma.gasTankTransaction.findMany({
      where: {
        walletId: { in: walletIds },
        operationType: { in: ['sweep', 'deploy_forwarder'] },
      },
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });
    if (txs.length === 0) {
      return { activity: [], meta: { count: 0 } };
    }

    const txHashes = txs.map((t) => t.txHash);
    const linkedDeposits = await this.prisma.deposit.findMany({
      where: {
        sweepTxHash: { in: txHashes },
        clientId: BigInt(clientId),
      },
    });

    const tokenIds = Array.from(
      new Set(linkedDeposits.map((d) => d.tokenId.toString())),
    ).map((s) => BigInt(s));
    const tokens = tokenIds.length
      ? await this.prisma.token.findMany({ where: { id: { in: tokenIds } } })
      : [];
    const tokenById = new Map(tokens.map((t) => [t.id.toString(), t]));

    // Chain metadata (name, native symbol) keyed by chainId
    const chainIds = Array.from(new Set(txs.map((t) => t.chainId)));
    const chains = await this.prisma.chain.findMany({
      where: { id: { in: chainIds } },
    });
    const chainById = new Map(chains.map((c) => [c.id, c]));

    // Native token (for gas-cost USD overlay) per chain
    const nativeTokens = await this.prisma.token.findMany({
      where: { chainId: { in: chainIds }, isNative: true, isActive: true },
    });
    const nativeByChain = new Map(nativeTokens.map((t) => [t.chainId, t]));

    // Single batched CoinGecko lookup covering both the deposit tokens and
    // the native tokens used for gas pricing.
    const coingeckoIds = Array.from(
      new Set(
        [...tokens, ...nativeTokens]
          .map((t) => t.coingeckoId)
          .filter((x): x is string => !!x),
      ),
    );
    const prices = coingeckoIds.length
      ? await this.pricing.getPricesUsd(coingeckoIds)
      : {};

    // Group deposits by sweep tx hash
    const depositsByTxHash = new Map<
      string,
      typeof linkedDeposits
    >();
    for (const d of linkedDeposits) {
      if (!d.sweepTxHash) continue;
      const key = d.sweepTxHash.toLowerCase();
      const arr = depositsByTxHash.get(key) ?? [];
      arr.push(d);
      depositsByTxHash.set(key, arr);
    }

    const activity = txs.map((t) => {
      const gas = walletById.get(t.walletId.toString());
      const chain = chainById.get(t.chainId);
      const native = nativeByChain.get(t.chainId);

      const gasCostNative =
        t.gasCostWei && /^\d+$/.test(t.gasCostWei)
          ? ethers.formatUnits(t.gasCostWei, native?.decimals ?? 18)
          : null;
      let gasCostUsd: string | null = null;
      if (gasCostNative && native?.coingeckoId) {
        const p = prices[native.coingeckoId];
        if (typeof p === 'number') {
          const n = Number(gasCostNative);
          if (Number.isFinite(n)) gasCostUsd = (n * p).toFixed(4);
        }
      }

      const linked = depositsByTxHash.get(t.txHash.toLowerCase()) ?? [];
      const deposits = linked.map((d) => {
        const token = tokenById.get(d.tokenId.toString());
        const decimals = token?.decimals ?? 18;
        let humanAmount: string;
        try {
          humanAmount = ethers.formatUnits(d.amountRaw, decimals);
        } catch {
          humanAmount = d.amount;
        }
        let amountUsd: string | null = null;
        if (token?.coingeckoId) {
          const p = prices[token.coingeckoId];
          if (typeof p === 'number') {
            const a = Number(humanAmount);
            if (Number.isFinite(a)) amountUsd = (a * p).toFixed(2);
          }
        }
        return {
          id: d.id.toString(),
          forwarderAddress: d.forwarderAddress,
          tokenSymbol: token?.symbol ?? null,
          tokenAddress: token?.contractAddress ?? null,
          tokenDecimals: decimals,
          amount: humanAmount,
          amountUsd,
          externalId: d.externalId,
          status: d.status,
          detectedAt: d.detectedAt.toISOString(),
        };
      });

      const totalUsd = deposits.reduce((sum, d) => {
        const v = d.amountUsd ? Number(d.amountUsd) : NaN;
        return Number.isFinite(v) ? sum + v : sum;
      }, 0);
      const anyPriced = deposits.some((d) => d.amountUsd !== null);

      const uniqForwarders = Array.from(
        new Set(deposits.map((d) => d.forwarderAddress.toLowerCase())),
      ).length;

      return {
        id: t.id.toString(),
        txHash: t.txHash,
        chainId: t.chainId,
        chainName: chain?.name ?? `Chain ${t.chainId}`,
        operationType: t.operationType,
        status: t.status,
        blockNumber: t.blockNumber ? t.blockNumber.toString() : null,
        submittedAt: t.submittedAt.toISOString(),
        confirmedAt: t.confirmedAt ? t.confirmedAt.toISOString() : null,
        gasTankAddress: gas?.address ?? null,
        destinationAddress: t.toAddress ?? null,
        gasUsedWei: t.gasUsed ? t.gasUsed.toString() : null,
        gasPriceWei: t.gasPriceWei,
        gasCostWei: t.gasCostWei,
        gasCostNative,
        gasCostNativeSymbol: native?.symbol ?? null,
        gasCostUsd,
        deposits,
        depositCount: deposits.length,
        uniqForwarders,
        totalValueUsd: anyPriced ? totalUsd.toFixed(2) : null,
      };
    });

    return {
      activity,
      meta: { count: activity.length, limit },
    };
  }
}
