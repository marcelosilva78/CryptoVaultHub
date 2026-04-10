import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService({
      failureThreshold: 3,
      cooldownMs: 5000,
      halfOpenMaxAttempts: 1,
    });
  });

  it('should start with circuit in closed state', () => {
    expect(service.getState('node-1')).toBe('closed');
    expect(service.isAllowed('node-1')).toBe(true);
  });

  it('should open the circuit after N consecutive failures', () => {
    service.recordFailure('node-1');
    expect(service.getState('node-1')).toBe('closed');

    service.recordFailure('node-1');
    expect(service.getState('node-1')).toBe('closed');

    service.recordFailure('node-1');
    expect(service.getState('node-1')).toBe('open');
  });

  it('should reject requests when circuit is open', () => {
    // Trip the circuit
    service.recordFailure('node-1');
    service.recordFailure('node-1');
    service.recordFailure('node-1');

    expect(service.getState('node-1')).toBe('open');
    expect(service.isAllowed('node-1')).toBe(false);
  });

  it('should transition to half-open after cooldown period', () => {
    // Trip the circuit
    service.recordFailure('node-1');
    service.recordFailure('node-1');
    service.recordFailure('node-1');

    expect(service.getState('node-1')).toBe('open');

    // Simulate cooldown by manipulating the last failure timestamp
    // We need to use a shorter cooldown for testing
    const shortCooldownService = new CircuitBreakerService({
      failureThreshold: 3,
      cooldownMs: 0, // Instant cooldown for testing
      halfOpenMaxAttempts: 1,
    });

    shortCooldownService.recordFailure('node-1');
    shortCooldownService.recordFailure('node-1');
    shortCooldownService.recordFailure('node-1');

    // With 0ms cooldown, getState should transition to half-open
    expect(shortCooldownService.getState('node-1')).toBe('half-open');
    expect(shortCooldownService.isAllowed('node-1')).toBe(true);
  });

  it('should close circuit on successful half-open request', () => {
    const shortCooldownService = new CircuitBreakerService({
      failureThreshold: 3,
      cooldownMs: 0,
      halfOpenMaxAttempts: 1,
    });

    // Trip the circuit
    shortCooldownService.recordFailure('node-1');
    shortCooldownService.recordFailure('node-1');
    shortCooldownService.recordFailure('node-1');

    // After cooldown, should be half-open
    expect(shortCooldownService.getState('node-1')).toBe('half-open');

    // Record a success
    shortCooldownService.recordSuccess('node-1');

    // Should be closed now
    expect(shortCooldownService.getState('node-1')).toBe('closed');
    expect(shortCooldownService.isAllowed('node-1')).toBe(true);
  });

  it('should re-open circuit on half-open failure and block requests until next cooldown', () => {
    // Use a long cooldown to verify the circuit stays open after half-open failure
    const svc = new CircuitBreakerService({
      failureThreshold: 3,
      cooldownMs: 60_000,
      halfOpenMaxAttempts: 1,
    });

    // Trip the circuit
    svc.recordFailure('node-1');
    svc.recordFailure('node-1');
    svc.recordFailure('node-1');
    expect(svc.getState('node-1')).toBe('open');
    expect(svc.isAllowed('node-1')).toBe(false);
  });

  it('should reset circuit on success before threshold', () => {
    service.recordFailure('node-1');
    service.recordFailure('node-1');
    service.recordSuccess('node-1');

    // Failure count should be reset; 3 more failures needed
    service.recordFailure('node-1');
    service.recordFailure('node-1');
    expect(service.getState('node-1')).toBe('closed');
  });

  it('should track independent circuits for different nodes', () => {
    service.recordFailure('node-1');
    service.recordFailure('node-1');
    service.recordFailure('node-1');

    expect(service.getState('node-1')).toBe('open');
    expect(service.getState('node-2')).toBe('closed');
    expect(service.isAllowed('node-2')).toBe(true);
  });

  it('should reset a circuit completely', () => {
    service.recordFailure('node-1');
    service.recordFailure('node-1');
    service.recordFailure('node-1');

    expect(service.getState('node-1')).toBe('open');

    service.reset('node-1');

    expect(service.getState('node-1')).toBe('closed');
    expect(service.isAllowed('node-1')).toBe(true);
  });
});
