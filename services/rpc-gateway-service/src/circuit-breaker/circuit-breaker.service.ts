import { Injectable, Logger } from '@nestjs/common';

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  openedAt: number;
}

const FAILURE_THRESHOLD = 5;
const OPEN_DURATION_MS = 30_000;

/**
 * Circuit breaker for RPC node connections.
 * Tracks per-node circuit states to prevent cascading failures.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitState>();

  /**
   * Get or create a circuit for a node.
   */
  getCircuit(nodeId: string): CircuitState {
    let circuit = this.circuits.get(nodeId);
    if (!circuit) {
      circuit = { state: 'closed', failures: 0, openedAt: 0 };
      this.circuits.set(nodeId, circuit);
    }
    return circuit;
  }

  /**
   * Check if a request is allowed through the circuit.
   */
  isAllowed(nodeId: string): boolean {
    const circuit = this.getCircuit(nodeId);

    if (circuit.state === 'closed') {
      return true;
    }

    if (circuit.state === 'open') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed >= OPEN_DURATION_MS) {
        circuit.state = 'half-open';
        this.logger.log(`Circuit for node ${nodeId} transitioned to half-open`);
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
    const circuit = this.getCircuit(nodeId);

    if (circuit.state === 'half-open') {
      // Single success in half-open closes the circuit
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.openedAt = 0;
      this.logger.log(`Circuit for node ${nodeId} closed after successful probe`);
    } else if (circuit.state === 'closed') {
      // Reset failure count on success in closed state
      circuit.failures = 0;
    }
  }

  /**
   * Record a failed response from a node.
   */
  recordFailure(nodeId: string): void {
    const circuit = this.getCircuit(nodeId);

    if (circuit.state === 'half-open') {
      // Failure in half-open immediately re-opens
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      this.logger.warn(`Circuit for node ${nodeId} re-opened after failed probe`);
      return;
    }

    circuit.failures++;
    if (circuit.failures >= FAILURE_THRESHOLD) {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      this.logger.warn(
        `Circuit for node ${nodeId} opened after ${circuit.failures} failures`,
      );
    }
  }

  /**
   * Reset a circuit to closed state.
   */
  reset(nodeId: string): void {
    this.circuits.set(nodeId, { state: 'closed', failures: 0, openedAt: 0 });
    this.logger.log(`Circuit for node ${nodeId} manually reset`);
  }

  /**
   * Get all circuit states (for monitoring).
   */
  getAllStates(): Map<string, CircuitState> {
    return new Map(this.circuits);
  }
}
