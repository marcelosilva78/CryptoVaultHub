import { RpcRouterService, RpcNode } from './rpc-router.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';

describe('RpcRouterService', () => {
  let service: RpcRouterService;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;
  let rateLimiter: jest.Mocked<RateLimiterService>;

  const testNodes: RpcNode[] = [
    {
      key: 'eth-primary',
      url: 'https://eth-primary.example.com',
      chainId: 1,
      priority: 1,
      isActive: true,
    },
    {
      key: 'eth-fallback',
      url: 'https://eth-fallback.example.com',
      chainId: 1,
      priority: 2,
      isActive: true,
    },
    {
      key: 'eth-backup',
      url: 'https://eth-backup.example.com',
      chainId: 1,
      priority: 3,
      isActive: true,
    },
    {
      key: 'polygon-primary',
      url: 'https://polygon.example.com',
      chainId: 137,
      priority: 1,
      isActive: true,
    },
  ];

  beforeEach(() => {
    circuitBreaker = {
      isAllowed: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      getState: jest.fn().mockReturnValue('closed'),
      reset: jest.fn(),
    } as any;

    rateLimiter = {
      isAllowed: jest.fn().mockReturnValue(true),
      recordUsage: jest.fn(),
      setConfig: jest.fn(),
      getUsage: jest.fn(),
    } as any;

    service = new RpcRouterService(circuitBreaker, rateLimiter);
    service.registerNodes(testNodes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should select the highest priority active node', () => {
    const selected = service.selectNode(1);

    expect(selected).toBeDefined();
    expect(selected!.key).toBe('eth-primary');
    expect(selected!.priority).toBe(1);
  });

  it('should fall back to next node on failure during executeWithFallback', async () => {
    const requestFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Primary failed'))
      .mockResolvedValueOnce({ result: 'success' });

    const result = await service.executeWithFallback(1, requestFn);

    expect(result.node.key).toBe('eth-fallback');
    expect(result.response).toEqual({ result: 'success' });
    expect(circuitBreaker.recordFailure).toHaveBeenCalledWith('eth-primary');
    expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('eth-fallback');
  });

  it('should skip circuit-broken nodes', () => {
    // Primary is circuit-broken
    circuitBreaker.isAllowed.mockImplementation((key: string) => {
      return key !== 'eth-primary';
    });

    const selected = service.selectNode(1);

    expect(selected).toBeDefined();
    expect(selected!.key).toBe('eth-fallback');
  });

  it('should skip rate-limited nodes', () => {
    // Primary is rate-limited
    rateLimiter.isAllowed.mockImplementation((key: string) => {
      return key !== 'eth-primary';
    });

    const selected = service.selectNode(1);

    expect(selected).toBeDefined();
    expect(selected!.key).toBe('eth-fallback');
  });

  it('should return null when no nodes are available for a chain', () => {
    // All nodes are circuit-broken
    circuitBreaker.isAllowed.mockReturnValue(false);

    const selected = service.selectNode(1);

    expect(selected).toBeNull();
  });

  it('should return null for chain with no registered nodes', () => {
    const selected = service.selectNode(999);

    expect(selected).toBeNull();
  });

  it('should skip both circuit-broken and rate-limited nodes in executeWithFallback', async () => {
    // Primary is circuit-broken, fallback is rate-limited
    circuitBreaker.isAllowed.mockImplementation((key: string) => {
      return key !== 'eth-primary';
    });
    rateLimiter.isAllowed.mockImplementation((key: string) => {
      return key !== 'eth-fallback';
    });

    const requestFn = jest.fn().mockResolvedValue({ result: 'from-backup' });

    const result = await service.executeWithFallback(1, requestFn);

    expect(result.node.key).toBe('eth-backup');
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('should throw when all nodes fail in executeWithFallback', async () => {
    const requestFn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(service.executeWithFallback(1, requestFn)).rejects.toThrow(
      'No available RPC node for chain 1',
    );
  });

  it('should record usage when a node is selected in executeWithFallback', async () => {
    const requestFn = jest.fn().mockResolvedValue({ ok: true });

    await service.executeWithFallback(1, requestFn);

    expect(rateLimiter.recordUsage).toHaveBeenCalledWith('eth-primary');
  });

  it('should select correct chain node', () => {
    const selected = service.selectNode(137);

    expect(selected).toBeDefined();
    expect(selected!.key).toBe('polygon-primary');
    expect(selected!.chainId).toBe(137);
  });
});
