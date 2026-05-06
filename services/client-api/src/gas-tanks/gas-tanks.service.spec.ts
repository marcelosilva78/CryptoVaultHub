import { Test } from '@nestjs/testing';
import { GasTanksService, BalanceProvider } from './gas-tanks.service';
import { AdminDatabaseService } from '../prisma/admin-database.service';

describe('GasTanksService', () => {
  const db = { query: jest.fn() } as unknown as AdminDatabaseService;

  const balance: BalanceProvider = {
    getNativeBalance: jest.fn(),
    getFeeData: jest.fn(),
  };

  let svc: GasTanksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        GasTanksService,
        { provide: AdminDatabaseService, useValue: db },
        { provide: 'BALANCE_SERVICE', useValue: balance },
      ],
    }).compile();
    svc = mod.get(GasTanksService);
  });

  // --------------------------------------------------------------------------
  // list
  // --------------------------------------------------------------------------

  it('list returns gas tanks with status, eta ops, and threshold', async () => {
    // tanks query (wallets JOIN chains)
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 137,
        chain_name: 'Polygon',
        native_symbol: 'MATIC',
        explorer_url: 'https://polygonscan.com',
        address: '0xGasTankAddr',
      },
    ]);

    // alert config query
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 137,
        threshold_wei: '1000000000000000',
        email_enabled: 0,
        webhook_enabled: 1,
      },
    ]);

    // balance: 0.0005 MATIC (critical)
    (balance.getNativeBalance as jest.Mock).mockResolvedValue('500000000000000');
    // gas price: 30 gwei
    (balance.getFeeData as jest.Mock).mockResolvedValue({
      gasPriceWei: '30000000000',
    });

    const out = await svc.list(9);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      chainId: 137,
      chainName: 'Polygon',
      address: '0xGasTankAddr',
      balanceWei: '500000000000000',
      thresholdWei: '1000000000000000',
      status: 'critical',
      estimatedOpsRemaining: Math.floor(500_000_000_000_000 / (30_000_000_000 * 21000)),
    });
  });

  it('list returns [] when no gas tanks exist for project', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([]);

    const out = await svc.list(99);

    expect(out).toEqual([]);
    // balance/fee should never be called
    expect(balance.getNativeBalance).not.toHaveBeenCalled();
  });

  it('list marks status ok when balance >= 2*threshold', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 1,
        chain_name: 'Ethereum',
        native_symbol: 'ETH',
        explorer_url: null,
        address: '0xEthTank',
      },
    ]);
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 1,
        threshold_wei: '1000000000000000',
        email_enabled: 1,
        webhook_enabled: 1,
      },
    ]);
    // balance = 3 * threshold → ok
    (balance.getNativeBalance as jest.Mock).mockResolvedValue('3000000000000000');
    (balance.getFeeData as jest.Mock).mockResolvedValue({ gasPriceWei: '10000000000' });

    const out = await svc.list(9);
    expect(out[0].status).toBe('ok');
  });

  it('list marks status low when balance is between threshold and 2*threshold', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 56,
        chain_name: 'BSC',
        native_symbol: 'BNB',
        explorer_url: null,
        address: '0xBscTank',
      },
    ]);
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 56,
        threshold_wei: '1000000000000000',
        email_enabled: 0,
        webhook_enabled: 0,
      },
    ]);
    // balance = 1.5 * threshold → low
    (balance.getNativeBalance as jest.Mock).mockResolvedValue('1500000000000000');
    (balance.getFeeData as jest.Mock).mockResolvedValue({ gasPriceWei: '5000000000' });

    const out = await svc.list(9);
    expect(out[0].status).toBe('low');
  });

  it('list returns ok status with zero threshold when no alert config exists', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 137,
        chain_name: 'Polygon',
        native_symbol: 'MATIC',
        explorer_url: null,
        address: '0xTank',
      },
    ]);
    // No alert config rows
    (db.query as jest.Mock).mockResolvedValueOnce([]);
    (balance.getNativeBalance as jest.Mock).mockResolvedValue('500000000000000');
    (balance.getFeeData as jest.Mock).mockResolvedValue({ gasPriceWei: '1000000000' });

    const out = await svc.list(9);
    expect(out[0].status).toBe('ok');
    expect(out[0].thresholdWei).toBe('0');
  });

  it('list handles live data fetch failure gracefully (falls back to 0 balance)', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 137,
        chain_name: 'Polygon',
        native_symbol: 'MATIC',
        explorer_url: null,
        address: '0xTank',
      },
    ]);
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        chain_id: 137,
        threshold_wei: '1000000000000000',
        email_enabled: 0,
        webhook_enabled: 1,
      },
    ]);
    (balance.getNativeBalance as jest.Mock).mockRejectedValue(new Error('RPC timeout'));
    (balance.getFeeData as jest.Mock).mockRejectedValue(new Error('RPC timeout'));

    const out = await svc.list(9);
    expect(out[0].balanceWei).toBe('0');
    expect(out[0].status).toBe('critical');
  });

  // --------------------------------------------------------------------------
  // getHistory
  // --------------------------------------------------------------------------

  it('history returns paginated rows for the project+chain', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([{ total: 1 }]);
    (db.query as jest.Mock).mockResolvedValueOnce([
      {
        id: '1',
        walletId: '10',
        projectId: '9',
        chainId: 137,
        txHash: '0xabc',
        operationType: 'sweep',
        toAddress: '0xDest',
        gasUsed: '21000',
        gasPriceWei: '30000000000',
        gasCostWei: '630000000000000',
        status: 'confirmed',
        blockNumber: '12345678',
        submittedAt: new Date('2026-01-01'),
        confirmedAt: new Date('2026-01-01'),
      },
    ]);

    const out = await svc.getHistory(9, 137, { limit: 50, offset: 0 });

    expect(out.total).toBe(1);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].txHash).toBe('0xabc');
  });

  it('history respects limit and offset parameters', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([{ total: 100 }]);
    (db.query as jest.Mock).mockResolvedValueOnce([]);

    const out = await svc.getHistory(9, 137, { limit: 10, offset: 20 });

    expect(out.total).toBe(100);
    expect(out.rows).toHaveLength(0);

    const rowsSqlCall = (db.query as jest.Mock).mock.calls[1];
    expect(rowsSqlCall[1]).toContain(10); // limit
    expect(rowsSqlCall[1]).toContain(20); // offset
  });

  it('history applies optional filters (type, from, to)', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([{ total: 0 }]);
    (db.query as jest.Mock).mockResolvedValueOnce([]);

    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');
    await svc.getHistory(9, 137, {
      limit: 50,
      offset: 0,
      type: 'sweep',
      from,
      to,
    });

    const countSqlCall = (db.query as jest.Mock).mock.calls[0];
    expect(countSqlCall[0]).toContain('operation_type = ?');
    expect(countSqlCall[0]).toContain('submitted_at >=');
    expect(countSqlCall[0]).toContain('submitted_at <=');
    expect(countSqlCall[1]).toContain('sweep');
    expect(countSqlCall[1]).toContain(from);
    expect(countSqlCall[1]).toContain(to);
  });

  // --------------------------------------------------------------------------
  // getTopupUri
  // --------------------------------------------------------------------------

  it('builds EIP-681 topup URI', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([{ address: '0xGasTankAddr' }]);

    const out = await svc.getTopupUri(9, 137);

    expect(out.eip681Uri).toBe('ethereum:0xGasTankAddr@137');
    expect(out.address).toBe('0xGasTankAddr');
  });

  it('getTopupUri throws NotFoundException when no wallet exists', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce([]);

    await expect(svc.getTopupUri(9, 999)).rejects.toThrow('No gas tank wallet found');
  });
});
