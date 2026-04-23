describe('Withdrawal Status State Machine', () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    'pending_approval': ['approved', 'pending_cosign', 'rejected', 'cancelled'],
    'pending_cosign': ['approved', 'cancelled'],
    'approved': ['broadcasting', 'cancelled'],
    'broadcasting': ['confirmed', 'failed'],
    'confirmed': [],
    'failed': [],
    'rejected': [],
    'cancelled': [],
  };

  it('should define all terminal states', () => {
    const terminalStates = Object.entries(VALID_TRANSITIONS)
      .filter(([_, targets]) => targets.length === 0)
      .map(([state]) => state);

    expect(terminalStates).toContain('confirmed');
    expect(terminalStates).toContain('failed');
    expect(terminalStates).toContain('rejected');
    expect(terminalStates).toContain('cancelled');
  });

  it('should not allow transitions from terminal states', () => {
    expect(VALID_TRANSITIONS['confirmed']).toEqual([]);
    expect(VALID_TRANSITIONS['failed']).toEqual([]);
    expect(VALID_TRANSITIONS['rejected']).toEqual([]);
    expect(VALID_TRANSITIONS['cancelled']).toEqual([]);
  });

  it('full_custody: pending_approval -> approved -> broadcasting -> confirmed', () => {
    const flow = ['pending_approval', 'approved', 'broadcasting', 'confirmed'];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(VALID_TRANSITIONS[flow[i]]).toContain(flow[i + 1]);
    }
  });

  it('co_sign: pending_approval -> pending_cosign -> approved -> broadcasting -> confirmed', () => {
    const flow = ['pending_approval', 'pending_cosign', 'approved', 'broadcasting', 'confirmed'];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(VALID_TRANSITIONS[flow[i]]).toContain(flow[i + 1]);
    }
  });

  it('co_sign expired: pending_approval -> pending_cosign -> cancelled', () => {
    expect(VALID_TRANSITIONS['pending_cosign']).toContain('cancelled');
  });
});
