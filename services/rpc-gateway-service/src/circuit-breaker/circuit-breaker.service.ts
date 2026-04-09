import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Circuit breaker states:
 *   closed   → healthy, requests flow normally
 *   open     → broken, all requests are rejected
 *   half-open → testing, a single probe request is allowed
 *
 * State is stored in Redis so it's shared across service instances.
 */

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureAt: number;
  openedAt: number;
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000; // 30 seconds before half-open
const HALF_OPEN_SUCCESS_THRESHOLD = 2;

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(private readonly redisService: RedisService) {}

  private key(nodeId: bigint | number): string {
    return `rpc:circuit:${nodeId.toString()}`;
  }

  private async getState(nodeId: bigint | number): Promise<CircuitState> {
    const redis = this.redisService.getClient();
    const raw = await redis.get(this.key(nodeId));
    if (!raw) {
      return { state: 'closed', failures: 0, lastFailureAt: 0, openedAt: 0 };
    }
    return JSON.parse(raw);
  }

  private async setState(
    nodeId: bigint | number,
    state: CircuitState,
  ): Promise<void> {
    const redis = this.redisService.getClient();
    // TTL of 5 minutes to auto-clean stale entries
    await redis.set(this.key(nodeId), JSON.stringify(state), 'EX', 300);
  }

  /**
   * Returns true if the circuit is open (broken) and requests should NOT proceed.
   * Also handles the transition from open → half-open after the cooldown.
   */
  async isOpen(nodeId: bigint | number): Promise<boolean> {
    const circuit = await this.getState(nodeId);

    if (circuit.state === 'closed') {
      return false;
    }

    if (circuit.state === 'open') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed >= OPEN_DURATION_MS) {
        // Transition to half-open
        circuit.state = 'half-open';
        await this.setState(nodeId, circuit);
        this.logger.log(
          `Circuit for node ${nodeId} transitioned to half-open`,
        );
        return false; // Allow a probe request
      }
      return true; // Still in cooldown
    }

    // half-open: allow the probe
    return false;
  }

  /**
   * Record a successful RPC call. Resets the circuit if in half-open state.
   */
  async recordSuccess(nodeId: bigint | number): Promise<void> {
    const circuit = await this.getState(nodeId);

    if (circuit.state === 'half-open') {
      circuit.failures = Math.max(0, circuit.failures - 1);
      if (circuit.failures <= HALF_OPEN_SUCCESS_THRESHOLD) {
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.openedAt = 0;
        this.logger.log(`Circuit for node ${nodeId} closed (recovered)`);
      }
    } else if (circuit.state === 'closed' && circuit.failures > 0) {
      // Decay failures on success
      circuit.failures = Math.max(0, circuit.failures - 1);
    }

    await this.setState(nodeId, circuit);
  }

  /**
   * Record a failed RPC call. May trip the circuit open.
   */
  async recordFailure(nodeId: bigint | number): Promise<void> {
    const circuit = await this.getState(nodeId);
    circuit.failures += 1;
    circuit.lastFailureAt = Date.now();

    if (
      circuit.state === 'half-open' ||
      (circuit.state === 'closed' && circuit.failures >= FAILURE_THRESHOLD)
    ) {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      this.logger.warn(
        `Circuit for node ${nodeId} tripped OPEN after ${circuit.failures} failures`,
      );
    }

    await this.setState(nodeId, circuit);
  }

  /**
   * Force-reset the circuit to closed state.
   */
  async reset(nodeId: bigint | number): Promise<void> {
    await this.setState(nodeId, {
      state: 'closed',
      failures: 0,
      lastFailureAt: 0,
      openedAt: 0,
    });
    this.logger.log(`Circuit for node ${nodeId} manually reset`);
  }

  /**
   * Get the current state of a circuit for diagnostics.
   */
  async getCircuitInfo(
    nodeId: bigint | number,
  ): Promise<CircuitState> {
    return this.getState(nodeId);
  }
}
