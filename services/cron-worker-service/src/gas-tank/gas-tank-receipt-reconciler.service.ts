import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50;
const TICK_MS = 30_000;

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

@Injectable()
export class GasTankReceiptReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GasTankReceiptReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.reconcile(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(): Promise<void> {
    try {
      await this.reconcileBatch();
    } catch (err) {
      this.logger.warn(`reconcile error: ${(err as Error).message}`);
    }
  }

  async reconcileBatch(): Promise<void> {
    const rows = await this.prisma.gasTankTransaction.findMany({
      where: {
        status: 'submitted',
        submittedAt: { lt: new Date(Date.now() - 15_000) },
      },
      orderBy: { submittedAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of rows) {
      try {
        const provider = await this.evmProvider.getProvider(row.chainId);
        const receipt = await provider.getTransactionReceipt(row.txHash);
        const ageMs = Date.now() - row.submittedAt.getTime();

        if (!receipt) {
          if (ageMs > MAX_AGE_MS) {
            await this.prisma.gasTankTransaction.update({
              where: { id: row.id },
              data: { status: 'failed', confirmedAt: new Date() },
            });
            this.logger.warn(
              `Marked gas-tank tx ${row.txHash} as failed (no receipt after ${Math.round(ageMs / 1000)}s)`,
            );
          }
          continue;
        }

        const gasCostWei = (receipt.gasUsed * receipt.gasPrice).toString();
        const newStatus = receipt.status === 1 ? 'confirmed' : 'failed';

        await this.prisma.gasTankTransaction.update({
          where: { id: row.id },
          data: {
            status: newStatus,
            gasUsed: receipt.gasUsed,
            gasCostWei,
            blockNumber: BigInt(receipt.blockNumber),
            confirmedAt: new Date(),
          },
        });

        this.logger.log(
          `Gas-tank tx ${row.txHash} on chain ${row.chainId} → ${newStatus} ` +
            `(gasUsed=${receipt.gasUsed}, gasCost=${gasCostWei} wei)`,
        );

        // Cascade reconciliation to deposits whose sweep_tx_hash matches this gas-tank tx.
        // When a sweep/flush tx confirms, transition deposits from 'sweep_pending' → 'swept' (or 'sweep_failed').
        //
        // CORRECTNESS GUARD: never cascade to 'swept' on the basis of receipt.status=1
        // alone. The EVM treats a call to a non-deployed address as a successful no-op
        // (gasUsed≈21k, status=1) — see incident with forwarder 0x613dbC... where the
        // sweep tx "succeeded" but the forwarder had no contract code and never moved
        // funds. We additionally verify that the forwarder's on-chain balance is now
        // zero for the swept token. If the forwarder still holds funds, the sweep was
        // a no-op and we leave the deposit in 'sweep_pending' for the next sweep cycle
        // (which now has its own isDeployed guard so it won't re-fire the no-op).
        if (row.operationType === 'sweep' || row.operationType === 'flush') {
          try {
            if (newStatus !== 'confirmed') {
              // tx itself failed on-chain → no balance check needed; cascade to sweep_failed.
              const updated = await this.prisma.deposit.updateMany({
                where: {
                  sweepTxHash: row.txHash,
                  chainId: row.chainId,
                  status: 'sweep_pending',
                },
                data: {
                  status: 'sweep_failed',
                  sweptAt: null,
                },
              });
              if (updated.count > 0) {
                this.logger.log(
                  `Cascaded ${updated.count} deposit(s) to 'sweep_failed' for sweep tx ${row.txHash}`,
                );
              }
            } else {
              // tx succeeded on-chain — verify it actually moved funds before cascading.
              const pendingDeposits = await this.prisma.deposit.findMany({
                where: {
                  sweepTxHash: row.txHash,
                  chainId: row.chainId,
                  status: 'sweep_pending',
                },
              });

              if (pendingDeposits.length === 0) {
                // Nothing to cascade — already reconciled or no matching deposits.
                continue;
              }

              // All deposits sharing a sweepTxHash share a forwarder address.
              const forwarderAddress = pendingDeposits[0].forwarderAddress;

              // Group by tokenId to verify each token balance independently.
              const tokenIds = [...new Set(pendingDeposits.map((d) => d.tokenId))];
              const tokens = await this.prisma.token.findMany({
                where: { id: { in: tokenIds } },
              });
              const tokenById = new Map(tokens.map((t) => [t.id, t]));

              const safeToCascadeIds: bigint[] = [];
              const noopIds: bigint[] = [];

              for (const tokenId of tokenIds) {
                const token = tokenById.get(tokenId);
                const depositsForToken = pendingDeposits.filter(
                  (d) => d.tokenId === tokenId,
                );
                if (!token) {
                  // Can't verify — be conservative and skip cascade.
                  noopIds.push(...depositsForToken.map((d) => d.id));
                  continue;
                }

                let postBalance: bigint;
                try {
                  if (token.isNative) {
                    postBalance = await provider.getBalance(forwarderAddress);
                  } else {
                    const erc20 = new ethers.Contract(
                      token.contractAddress,
                      ERC20_ABI,
                      provider,
                    );
                    postBalance = (await erc20.balanceOf(
                      forwarderAddress,
                    )) as bigint;
                  }
                } catch (balanceErr) {
                  this.logger.warn(
                    `Could not read post-sweep balance for forwarder ${forwarderAddress}, token ${token.symbol} on chain ${row.chainId}: ${(balanceErr as Error).message}. Leaving deposits in sweep_pending.`,
                  );
                  noopIds.push(...depositsForToken.map((d) => d.id));
                  continue;
                }

                // After a successful flush, the forwarder should be empty for this token.
                // Any residual balance means the tx was a no-op (most likely the
                // forwarder wasn't deployed, so calldata 0x6b9f96ea hit a bare EOA).
                if (postBalance === 0n) {
                  safeToCascadeIds.push(
                    ...depositsForToken.map((d) => d.id),
                  );
                } else {
                  this.logger.warn(
                    `Not cascading ${depositsForToken.length} deposit(s) to 'swept' for tx ${row.txHash}: forwarder ${forwarderAddress} still holds ${postBalance.toString()} of ${token.symbol} (expected 0). Likely a no-op sweep tx — leaving in sweep_pending.`,
                  );
                  noopIds.push(...depositsForToken.map((d) => d.id));
                }
              }

              if (safeToCascadeIds.length > 0) {
                const updated = await this.prisma.deposit.updateMany({
                  where: {
                    id: { in: safeToCascadeIds },
                    status: 'sweep_pending',
                  },
                  data: {
                    status: 'swept',
                    sweptAt: new Date(),
                  },
                });
                if (updated.count > 0) {
                  this.logger.log(
                    `Cascaded ${updated.count} deposit(s) to 'swept' for sweep tx ${row.txHash} (verified forwarder balance is zero)`,
                  );
                }
              }

              // Orphan-reconciliation pass: a sweep tx empties the forwarder
              // for the swept token (we verified postBalance == 0). Any other
              // deposit row on the same (chainId, forwarderAddress, tokenId)
              // tuple that is still in a non-terminal status (pending,
              // detected, confirming, confirmed) was ALSO swept by this same
              // tx — those rows usually exist because:
              //   - polling-detector created a row before its source field
              //     was honoured by the persistence handler (status='pending');
              //   - the realtime path and the polling path BOTH emitted for
              //     the same balance change (one real txHash, one polling
              //     synth), and the polling row was never linked to a sweep.
              // Cascading them here prevents the row from being stranded forever
              // with confirmations=0 / status=pending while the actual funds
              // are already in the hot wallet.
              const tokenIdsCascaded = [
                ...new Set(
                  pendingDeposits
                    .filter((d) => safeToCascadeIds.includes(d.id))
                    .map((d) => d.tokenId),
                ),
              ];
              if (tokenIdsCascaded.length > 0) {
                const orphans = await this.prisma.deposit.updateMany({
                  where: {
                    chainId: row.chainId,
                    forwarderAddress: forwarderAddress.toLowerCase(),
                    tokenId: { in: tokenIdsCascaded },
                    status: {
                      in: ['pending', 'detected', 'confirming', 'confirmed'],
                    },
                  },
                  data: {
                    status: 'swept',
                    sweepTxHash: row.txHash,
                    sweptAt: new Date(),
                    confirmedAt: new Date(),
                  },
                });
                if (orphans.count > 0) {
                  this.logger.log(
                    `Orphan-reconciled ${orphans.count} stale deposit row(s) on forwarder ${forwarderAddress} for sweep tx ${row.txHash} (forwarder balance is zero — they were swept by the same tx)`,
                  );
                }
              }

              if (noopIds.length > 0) {
                this.logger.warn(
                  `Held back ${noopIds.length} deposit(s) from cascade for tx ${row.txHash} (forwarder still funded — suspected no-op sweep). Next sweep cycle will retry once forwarder is deployed.`,
                );
              }
            }
          } catch (cascadeErr) {
            this.logger.warn(
              `Deposit cascade reconciliation failed for tx ${row.txHash}: ${(cascadeErr as Error).message}`,
            );
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to reconcile tx ${row.txHash} on chain ${row.chainId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
