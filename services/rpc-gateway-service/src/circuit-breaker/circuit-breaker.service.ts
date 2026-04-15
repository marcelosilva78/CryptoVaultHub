import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  openedAt: number;
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000;
const CIRCUIT_TTL_S = 3600; // 1 hour TTL for circuit keys in Redis

/**
 * Circuit breaker for RPC node connections.
 * Tracks per-node circuit states in Redis for persistence across restarts
 * and state sharing across replicas.
 */
@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly logger = new Logger(CircuitBreakerService.name);

  /** Local in-memory cache to avoid Redis round-trips on every call */
  private readonly localCache = new Map<string, { circuit: CircuitState; cachedAt: number }>();
  private readonly LOCAL_CACHE_TTL_MS = 2_000; // refresh from Redis every 2s

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    this.logger.log('CircuitBreakerService initialized with Redis-backed state');
  }

  /**
   * Redis key helpers.
   */
  private stateKey(nodeId: string): string {
    return `circuit:${nodeId}:state`;
  }

  private failuresKey(nodeId: string): string {
    return `circuit:${nodeId}:failures`;
  }

  private openedAtKey(nodeId: string): string {
    return `circuit:${nodeId}:openedAt`;
  }

  /**
   * Get or create a circuit for a node from Redis (with local cache).
   */
  async getCircuit(nodeId: string): Promise<CircuitState> {
    // Check local cache first
    const cached = this.localCache.get(nodeId);
    if (cached && Date.now() - cached.cachedAt < this.LOCAL_CACHE_TTL_MS) {
      return cached.circuit;
    }

    const client = this.redis.getClient();
    const [state, failures, openedAt] = await client.mget(
      this.stateKey(nodeId),
      this.failuresKey(nodeId),
      this.openedAtKey(nodeId),
    );

    const circuit: CircuitState = {
      state: (state as CircuitState['state']) || 'closed',
      failures: failures ? parseInt(failures, 10) : 0,
      openedAt: openedAt ? parseInt(openedAt, 10) : 0,
    };

    this.localCache.set(nodeId, { circuit, cachedAt: Date.now() });
    return circuit;
  }

  /**
   * Persist circuit state to Redis and update local cache.
   */
  private async saveCircuit(nodeId: string, circuit: CircuitState): Promise<void> {
    const client = this.redis.getClient();
    const pipeline = client.pipeline();

    pipeline.set(this.stateKey(nodeId), circuit.state, 'EX', CIRCUIT_TTL_S);
    pipeline.set(this.failuresKey(nodeId), circuit.failures.toString(), 'EX', CIRCUIT_TTL_S);
    pipeline.set(this.openedAtKey(nodeId), circuit.openedAt.toString(), 'EX', CIRCUIT_TTL_S);

    await pipeline.exec();

    this.localCache.set(nodeId, { circuit, cachedAt: Date.now() });
  }

  /**
   * Check if a request is allowed through the circuit.
   */
  isAllowed(nodeId: string): boolean {
    // Use local cache for synchronous hot-path (populated by getCircuit / save calls)
    const cached = this.localCache.get(nodeId);
    const circuit = cached?.circuit ?? { state: 'closed' as const, failures: 0, openedAt: 0 };

    if (circuit.state === 'closed') {
      return true;
    }

    if (circuit.state === 'open') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed >= OPEN_DURATION_MS) {
        // Transition to half-open synchronously in local cache;
        // persisted when recordSuccess/recordFailure is called next
        circuit.state = 'half-open';
        this.localCache.set(nodeId, { circuit, cachedAt: Date.now() });
        this.logger.log(`Circuit for node ${nodeId} transitioned to half-open`);
        // Fire-and-forget Redis update
        this.saveCircuit(nodeId, circuit).catch(() => {});
        return true; // Allow a single probe request
      }
      return false;
    }

    // half-open: allow probe requests
    return true;
  }

  /**
   * Record a successful response from a node.
   */
  recordSuccess(nodeId: string): void {
    const cached = this.localCache.get(nodeId);
    const circuit = cached?.circuit ?? { state: 'closed' as const, failures: 0, openedAt: 0 };

    if (circuit.state === 'half-open') {
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.openedAt = 0;
      this.logger.log(`Circuit for node ${nodeId} closed after successful probe`);
    } else if (circuit.state === 'closed') {
      circuit.failures = 0;
    }

    this.localCache.set(nodeId, { circuit, cachedAt: Date.now() });
    this.saveCircuit(nodeId, circuit).catch((err) => {
      this.logger.warn(`Failed to persist circuit success for node ${nodeId}: ${err.message}`);
    });
  }

  /**
   * Record a failed response from a node.
   */
  recordFailure(nodeId: string): void {
    const cached = this.localCache.get(nodeId);
    const circuit = cached?.circuit ?? { state: 'closed' as const, failures: 0, openedAt: 0 };

    if (circuit.state === 'half-open') {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      this.logger.warn(`Circuit for node ${nodeId} re-opened after failed probe`);
    } else {
      circuit.failures++;
      if (circuit.failures >= FAILURE_THRESHOLD) {
        circuit.state = 'open';
        circuit.openedAt = Date.now();
        this.logger.warn(
          `Circuit for node ${nodeId} opened after ${circuit.failures} failures`,
        );
      }
    }

    this.localCache.set(nodeId, { circuit, cachedAt: Date.now() });
    this.saveCircuit(nodeId, circuit).catch((err) => {
      this.logger.warn(`Failed to persist circuit failure for node ${nodeId}: ${err.message}`);
    });
  }

  /**
   * Reset a circuit to closed state.
   */
  async reset(nodeId: string): Promise<void> {
    const circuit: CircuitState = { state: 'closed', failures: 0, openedAt: 0 };
    await this.saveCircuit(nodeId, circuit);
    this.logger.log(`Circuit for node ${nodeId} manually reset`);
  }

  /**
   * Get all circuit states from Redis (for monitoring).
   * Scans for circuit:*:state keys.
   */
  async getAllStates(): Promise<Map<string, CircuitState>> {
    const client = this.redis.getClient();
    const result = new Map<string, CircuitState>();
    let cursor = '0';

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'circuit:*:state', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        // Extract nodeId from "circuit:{nodeId}:state"
        const nodeId = key.replace('circuit:', '').replace(':state', '');
        const circuit = await this.getCircuit(nodeId);
        result.set(nodeId, circuit);
      }
    } while (cursor !== '0');

    return result;
  }
}
