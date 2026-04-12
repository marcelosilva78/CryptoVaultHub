#!/bin/bash
set -e
PYROOT=/code

apply_fix() {
    local file="$1"; local old="$2"; local new="$3"
    if [ -f "$file" ] && grep -qF "$old" "$file"; then
        sed -i "s|${old}|${new}|g" "$file"
    fi
}

# Fix 1: DateTime64 TTL compatibility - wrap DateTime64 columns with toDateTime()
apply_fix "${PYROOT}/posthog/models/duplicate_events/sql.py" \
    "TTL inserted_at + INTERVAL 7 DAY DELETE" \
    "TTL toDateTime(inserted_at) + INTERVAL 7 DAY DELETE"

apply_fix "${PYROOT}/posthog/clickhouse/logs/logs32.py" \
    "TTL created_at + interval" \
    "TTL toDateTime(created_at) + interval"

apply_fix "${PYROOT}/products/error_tracking/backend/embedding.py" \
    "TTL timestamp + INTERVAL 3 MONTH" \
    "TTL toDateTime(timestamp) + INTERVAL 3 MONTH"

apply_fix "${PYROOT}/products/error_tracking/backend/indexed_embedding.py" \
    "TTL timestamp + INTERVAL" \
    "TTL toDateTime(timestamp) + INTERVAL"

apply_fix "${PYROOT}/products/error_tracking/backend/indexed_embedding.py" \
    "TTL inserted_at + INTERVAL" \
    "TTL toDateTime(inserted_at) + INTERVAL"

apply_fix "${PYROOT}/posthog/models/ai_events/sql.py" \
    "TTL timestamp + INTERVAL" \
    "TTL toDateTime(timestamp) + INTERVAL"

apply_fix "${PYROOT}/posthog/clickhouse/preaggregation/sql.py" \
    "TTL expires_at + INTERVAL" \
    "TTL toDateTime(expires_at) + INTERVAL"

apply_fix "${PYROOT}/posthog/clickhouse/preaggregation/experiment_exposures_sql.py" \
    "TTL expires_at + INTERVAL" \
    "TTL toDateTime(expires_at) + INTERVAL"

# Fix bare "TTL expires_at" (no INTERVAL) - sed newline handling
PREAGG_SQL="${PYROOT}/posthog/clickhouse/preaggregation/sql.py"
if [ -f "$PREAGG_SQL" ] && grep -q "^TTL expires_at$" "$PREAGG_SQL"; then
    sed -i 's/^TTL expires_at$/TTL toDateTime(expires_at)/' "$PREAGG_SQL"
fi

PREAGG_EXP="${PYROOT}/posthog/clickhouse/preaggregation/experiment_exposures_sql.py"
if [ -f "$PREAGG_EXP" ] && grep -q "^TTL expires_at$" "$PREAGG_EXP"; then
    sed -i 's/^TTL expires_at$/TTL toDateTime(expires_at)/' "$PREAGG_EXP"
fi

# Fix migration 0205: MODIFY TTL expires_at
MIGRATION_0205="${PYROOT}/posthog/clickhouse/migrations/0205_preaggregation_results_expires_at.py"
apply_fix "$MIGRATION_0205" "MODIFY TTL expires_at" "MODIFY TTL toDateTime(expires_at)"

# Fix 2: system.crash_log removed in ClickHouse 25.x
# Handles both original and partially-applied states
CUSTOM_METRICS_FILE="${PYROOT}/posthog/clickhouse/custom_metrics.py"
if [ -f "$CUSTOM_METRICS_FILE" ]; then
    python3 - "$CUSTOM_METRICS_FILE" << 'PYEOF'
import sys
f = sys.argv[1]
content = open(f).read()
changed = False

# Case 1: original
old1 = "FROM system.crash_log\n    WHERE event_date = today()\n    GROUP BY hostname()"
new1 = "FROM system.one\n    WHERE 1=0\n    GROUP BY hostname()"
if old1 in content:
    content = content.replace(old1, new1)
    changed = True

# Case 2: partial fix (v1) left dangling WHERE
old2 = "FROM system.one WHERE 1=0\n    WHERE event_date = today()\n    GROUP BY hostname()"
new2 = "FROM system.one\n    WHERE 1=0\n    GROUP BY hostname()"
if old2 in content:
    content = content.replace(old2, new2)
    changed = True

if changed:
    open(f, 'w').write(content)
    print("Applied crash_log fix")
PYEOF
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
