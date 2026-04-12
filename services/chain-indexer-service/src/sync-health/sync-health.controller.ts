import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { SyncHealthService } from './sync-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Internal HTTP endpoints for the chain indexer.
 * Called by admin-api's SyncManagementService.
 */
@Controller()
export class SyncHealthController {
  constructor(
    private readonly syncHealthService: SyncHealthService,
    private readonly prisma: PrismaService,
    @InjectQueue('backfill') private readonly backfillQueue: Queue,
  ) {}

  @Get('sync-health')
  async getHealth() {
    const chains = await this.syncHealthService.getAllChainHealth();
    return { chains };
  }

  @Get('sync-gaps')
  async getGaps(
    @Query('chainId') chainId?: string,
    @Query('status') status?: string,
  ) {
    let sql =
      `SELECT id, chain_id, gap_start_block, gap_end_block, status,
              attempt_count, max_attempts, last_error, detected_at, resolved_at
       FROM sync_gaps WHERE 1=1`;
    const params: any[] = [];

    if (chainId) {
      sql += ' AND chain_id = ?';
      params.push(parseInt(chainId, 10));
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY detected_at DESC LIMIT 100';

    const gaps = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        chain_id: number;
        gap_start_block: bigint;
        gap_end_block: bigint;
        status: string;
        attempt_count: number;
        max_attempts: number;
        last_error: string | null;
        detected_at: Date;
        resolved_at: Date | null;
      }>
    >(sql, ...params);

    return {
      gaps: gaps.map((g: any) => ({
        id: Number(g.id),
        chainId: g.chain_id,
        gapStartBlock: Number(g.gap_start_block),
        gapEndBlock: Number(g.gap_end_block),
        status: g.status,
        attemptCount: g.attempt_count,
        maxAttempts: g.max_attempts,
        lastError: g.last_error,
        detectedAt: g.detected_at,
        resolvedAt: g.resolved_at,
      })),
    };
  }

  @Post('sync-gaps/:id/retry')
  async retryGap(@Param('id') id: string) {
    const gapId = parseInt(id, 10);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        chain_id: number;
        gap_start_block: bigint;
        gap_end_block: bigint;
      }>
    >(
      `SELECT id, chain_id, gap_start_block, gap_end_block
       FROM sync_gaps WHERE id = ? LIMIT 1`,
      gapId,
    );

    const gap = rows[0] ?? null;
    if (!gap) {
      return { error: `Gap ${gapId} not found` };
    }

    // Reset gap for retry
    await this.prisma.$executeRawUnsafe(
      `UPDATE sync_gaps
       SET status = 'detected', attempt_count = 0, last_error = NULL, resolved_at = NULL
       WHERE id = ?`,
      gapId,
    );

    // Enqueue backfill job
    await this.backfillQueue.add(
      'backfill-gap',
      {
        gapId,
        chainId: gap.chain_id,
        startBlock: Number(gap.gap_start_block),
        endBlock: Number(gap.gap_end_block),
      },
      {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    return { message: `Backfill retry enqueued for gap ${gapId}` };
  }

  /* ── Chain CRUD ── */
  @Get('chains')
  async listChains() {
    const chains = await this.prisma.chain.findMany({ orderBy: { id: 'asc' } });
    return {
      chains: chains.map((c: any) => ({
        id: c.id,
        chainId: c.id,
        name: c.name,
        symbol: c.nativeCurrencySymbol,
        rpcUrl: Array.isArray(c.rpcEndpoints) ? c.rpcEndpoints[0] : (c.rpcEndpoints as any)?.[0] ?? '',
        explorerUrl: c.explorerUrl ?? null,
        confirmationsRequired: c.confirmationsDefault,
        isActive: c.isActive,
        createdAt: c.createdAt,
      })),
    };
  }

  @Post('chains')
  async addChain(@Body() body: {
    name: string;
    symbol: string;
    chainId: number;
    rpcUrl: string;
    explorerUrl?: string;
    confirmationsRequired?: number;
    isActive?: boolean;
  }) {
    const chain = await this.prisma.chain.create({
      data: {
        id: body.chainId,
        name: body.name,
        shortName: body.symbol,
        nativeCurrencySymbol: body.symbol,
        rpcEndpoints: [body.rpcUrl] as any,
        blockTimeSeconds: 12,
        confirmationsDefault: body.confirmationsRequired ?? 12,
        explorerUrl: body.explorerUrl ?? null,
        isActive: body.isActive ?? true,
      },
    });
    return { chain: { ...chain, chainId: chain.id, symbol: chain.nativeCurrencySymbol, confirmationsRequired: chain.confirmationsDefault } };
  }

  /* ── Token CRUD ── */
  @Get('tokens')
  async listTokens() {
    const tokens = await this.prisma.token.findMany({ orderBy: { id: 'asc' } });
    return {
      tokens: tokens.map((t: any) => ({
        id: Number(t.id),
        chainId: t.chainId,
        contractAddress: t.contractAddress,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        isNative: t.isNative,
        isActive: t.isActive,
        createdAt: t.createdAt,
      })),
    };
  }

  @Post('tokens')
  async addToken(@Body() body: {
    name: string;
    symbol: string;
    chainId: number;
    contractAddress: string;
    decimals: number;
    isActive?: boolean;
  }) {
    const token = await this.prisma.token.create({
      data: {
        chainId: body.chainId,
        contractAddress: body.contractAddress,
        symbol: body.symbol,
        name: body.name,
        decimals: body.decimals,
        isActive: body.isActive ?? true,
      },
    });
    return { token: { id: Number(token.id), chainId: token.chainId, contractAddress: token.contractAddress, symbol: token.symbol, name: token.name, decimals: token.decimals, isActive: token.isActive } };
  }

  @Get('reorgs')
  async getReorgs(
    @Query('chainId') chainId?: string,
    @Query('limit') limit?: string,
  ) {
    let sql =
      `SELECT id, chain_id, reorg_at_block, old_block_hash, new_block_hash,
              depth, events_invalidated, balances_recalculated, detected_at, reindexed_at
       FROM reorg_log WHERE 1=1`;
    const params: any[] = [];

    if (chainId) {
      sql += ' AND chain_id = ?';
      params.push(parseInt(chainId, 10));
    }
    sql += ` ORDER BY detected_at DESC LIMIT ${limit ? parseInt(limit, 10) : 50}`;

    const reorgs = await this.prisma.$queryRawUnsafe<
      Array<{
        id: bigint;
        chain_id: number;
        reorg_at_block: bigint;
        old_block_hash: string | null;
        new_block_hash: string | null;
        depth: number;
        events_invalidated: number;
        balances_recalculated: number;
        detected_at: Date;
        reindexed_at: Date | null;
      }>
    >(sql, ...params);

    return {
      reorgs: reorgs.map((r: any) => ({
        id: Number(r.id),
        chainId: r.chain_id,
        reorgAtBlock: Number(r.reorg_at_block),
        oldBlockHash: r.old_block_hash,
        newBlockHash: r.new_block_hash,
        depth: r.depth,
        eventsInvalidated: r.events_invalidated,
        balancesRecalculated: r.balances_recalculated,
        detectedAt: r.detected_at,
        reindexedAt: r.reindexed_at,
      })),
    };
  }

  @Get('events/recent')
  async getRecentEvents(
    @Query('limit') limit?: string,
    @Query('chainId') chainId?: string,
  ) {
    const parsed = parseInt(limit ?? '20', 10);
    const take = Math.min(isNaN(parsed) ? 20 : parsed, 100);
    const where: any = {};
    if (chainId) where.chainId = parseInt(chainId, 10);

    const events = await this.prisma.indexedEvent.findMany({
      where,
      orderBy: [{ processedAt: 'desc' }, { id: 'desc' }],
      take,
    });

    // Resolve token symbols from contract addresses (composite key to avoid cross-chain collisions)
    const contractAddrs = [...new Set(events.map((e) => e.contractAddress))];
    const tokens =
      contractAddrs.length > 0
        ? await this.prisma.token.findMany({
            where: { contractAddress: { in: contractAddrs } },
            select: { contractAddress: true, chainId: true, symbol: true, decimals: true },
          })
        : [];
    const tokenMap = new Map(tokens.map((t) => [`${t.chainId}:${t.contractAddress}`, t]));

    // Resolve chain names
    const chainIds = [...new Set(events.map((e) => e.chainId))];
    const chains = await this.prisma.chain.findMany({
      where: { id: { in: chainIds } },
      select: { id: true, name: true },
    });
    const chainMap = new Map(chains.map((c) => [c.id, c.name]));

    return {
      events: events.map((e) => {
        const token = tokenMap.get(`${e.chainId}:${e.contractAddress}`);
        return {
          id: String(e.id),
          chainId: e.chainId,
          chainName: chainMap.get(e.chainId) ?? null,
          blockNumber: String(e.blockNumber),
          txHash: e.txHash,
          logIndex: e.logIndex,
          contractAddress: e.contractAddress,
          eventType: e.eventType,
          fromAddress: e.fromAddress ?? null,
          toAddress: e.toAddress ?? null,
          amount: e.amount != null ? String(e.amount) : null,
          tokenSymbol: token?.symbol ?? null,
          tokenDecimals: token?.decimals ?? null,
          clientId: e.clientId != null ? String(e.clientId) : null,
          projectId: e.projectId != null ? Number(e.projectId) : null,
          walletId: e.walletId != null ? Number(e.walletId) : null,
          isInbound: e.isInbound ?? null,
          rawData: e.rawData ?? null,
          processedAt: e.processedAt ?? null,
        };
      }),
    };
  }
}
