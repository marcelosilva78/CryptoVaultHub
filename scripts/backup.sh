#!/bin/bash
set -euo pipefail

BACKUP_DIR="/docker/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

mkdir -p "$BACKUP_DIR/redis"

# Redis backup
docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" BGSAVE
sleep 5
docker compose cp redis:/data/dump.rdb "$BACKUP_DIR/redis/dump-${DATE}.rdb"
gzip "$BACKUP_DIR/redis/dump-${DATE}.rdb"

# Cleanup old backups (keep last 7)
find "$BACKUP_DIR/redis" -name "dump-*.rdb.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
