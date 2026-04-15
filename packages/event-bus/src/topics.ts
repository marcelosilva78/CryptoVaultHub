// packages/event-bus/src/topics.ts

export const TOPICS = {
  // Financial (30-day retention)
  DEPOSITS_DETECTED: 'cvh.deposits.detected',
  DEPOSITS_CONFIRMED: 'cvh.deposits.confirmed',
  DEPOSITS_SWEPT: 'cvh.deposits.swept',
  WITHDRAWALS_LIFECYCLE: 'cvh.withdrawals.lifecycle',

  // Operational (7-day retention)
  CHAIN_STATUS: 'cvh.chain.status',
  CHAIN_HEALTH: 'cvh.chain.health',
  RPC_FAILOVER: 'cvh.rpc.failover',
  RPC_QUOTA: 'cvh.rpc.quota',
  GAS_TANK_ALERTS: 'cvh.gas-tank.alerts',
  REORG_DETECTED: 'cvh.reorg.detected',
  RECONCILIATION_DISCREPANCY: 'cvh.reconciliation.discrepancy',
  FORWARDER_DEPLOY: 'cvh.forwarder.deploy',
  SANCTIONS_SYNC: 'cvh.sanctions.sync',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];

/**
 * Map legacy Redis Stream names to Kafka topics.
 */
export const STREAM_TO_TOPIC: Record<string, TopicName> = {
  // Financial streams
  'deposits:detected': TOPICS.DEPOSITS_DETECTED,
  'deposits:confirmation': TOPICS.DEPOSITS_CONFIRMED,
  'deposits:swept': TOPICS.DEPOSITS_SWEPT,
  'withdrawals:submitted': TOPICS.WITHDRAWALS_LIFECYCLE,
  'withdrawals:confirmed': TOPICS.WITHDRAWALS_LIFECYCLE,
  'withdrawals:failed': TOPICS.WITHDRAWALS_LIFECYCLE,

  // Operational streams
  'gas_tank:alerts': TOPICS.GAS_TANK_ALERTS,
  'chain:reorg': TOPICS.REORG_DETECTED,
  'reconciliation:discrepancies': TOPICS.RECONCILIATION_DISCREPANCY,
  'forwarder:deploy': TOPICS.FORWARDER_DEPLOY,
  'sanctions:sync': TOPICS.SANCTIONS_SYNC,
};
