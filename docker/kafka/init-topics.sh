#!/bin/bash
# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
until /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka:9092 > /dev/null 2>&1; do
  sleep 2
done
echo "Kafka is ready. Creating topics..."

KAFKA_BIN="/opt/kafka/bin"

# Financial topics — 30-day retention (2592000000 ms)
for TOPIC in cvh.deposits.detected cvh.deposits.confirmed cvh.deposits.swept cvh.withdrawals.lifecycle; do
  $KAFKA_BIN/kafka-topics.sh --bootstrap-server kafka:9092 \
    --create --if-not-exists \
    --topic "$TOPIC" \
    --partitions 8 \
    --replication-factor 1 \
    --config retention.ms=2592000000
  echo "Created topic: $TOPIC (30-day retention)"
done

# Operational topics — 7-day retention (604800000 ms)
for TOPIC in cvh.chain.status cvh.chain.health cvh.rpc.failover cvh.rpc.quota cvh.gas-tank.alerts cvh.reorg.detected cvh.reconciliation.discrepancy; do
  $KAFKA_BIN/kafka-topics.sh --bootstrap-server kafka:9092 \
    --create --if-not-exists \
    --topic "$TOPIC" \
    --partitions 4 \
    --replication-factor 1 \
    --config retention.ms=604800000
  echo "Created topic: $TOPIC (7-day retention)"
done

echo "All topics created successfully."
