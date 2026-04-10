#!/bin/bash
# =============================================================================
# CryptoVaultHub — Database Migration Runner
# Runs all SQL migration scripts in order against a MySQL 8+ instance.
#
# Usage:
#   ./migrate.sh                          # Uses defaults (localhost:3306, root)
#   ./migrate.sh -h 10.0.0.5 -u admin -p # Custom host/user, prompt password
#   ./migrate.sh --from 13                # Start from migration 013
#   ./migrate.sh --dry-run                # Show what would be executed
#   ./migrate.sh --from 13 --dry-run      # Dry-run from migration 013 onward
#
# Environment variables (override defaults):
#   MYSQL_HOST  — MySQL host (default: localhost)
#   MYSQL_PORT  — MySQL port (default: 3306)
#   MYSQL_USER  — MySQL user (default: root)
# =============================================================================

set -euo pipefail

# ── Color codes ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASS_FLAG=""
FROM_MIGRATION=0
DRY_RUN=0

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--host)      MYSQL_HOST="$2"; shift 2 ;;
    -P|--port)      MYSQL_PORT="$2"; shift 2 ;;
    -u|--user)      MYSQL_USER="$2"; shift 2 ;;
    -p|--password)  MYSQL_PASS_FLAG="-p"; shift ;;
    --from)         FROM_MIGRATION="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    *)              echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================="
echo "  CryptoVaultHub — Database Migration"
echo "============================================="
echo "  Host: ${MYSQL_HOST}:${MYSQL_PORT}"
echo "  User: ${MYSQL_USER}"
if [ "$FROM_MIGRATION" -gt 0 ]; then
  echo "  From: $(printf '%03d' "$FROM_MIGRATION")"
fi
if [ "$DRY_RUN" -eq 1 ]; then
  echo -e "  Mode: ${YELLOW}DRY RUN${NC}"
fi
echo "============================================="
echo ""

TOTAL=0
SUCCEEDED=0
SKIPPED=0
FAILED=0
TOTAL_TIME=0

for file in "${SCRIPT_DIR}"/0*.sql; do
  filename="$(basename "$file")"

  # Extract numeric prefix (e.g., 013 from 013-foo.sql -> 13)
  migration_num="$(echo "$filename" | grep -oE '^[0-9]+' | sed 's/^0*//' )"
  migration_num="${migration_num:-0}"

  # Skip migrations below --from threshold
  if [ "$migration_num" -lt "$FROM_MIGRATION" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  TOTAL=$((TOTAL + 1))

  if [ "$DRY_RUN" -eq 1 ]; then
    echo -e "  ${CYAN}[DRY RUN]${NC} Would execute ${filename}"
    continue
  fi

  # Run migration and measure time
  echo -n "  Running ${filename}... "
  START_TIME=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

  if mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" $MYSQL_PASS_FLAG < "$file" 2>&1; then
    END_TIME=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    TOTAL_TIME=$((TOTAL_TIME + ELAPSED_MS))
    echo -e "${GREEN}OK${NC} (${ELAPSED_MS}ms)"
    SUCCEEDED=$((SUCCEEDED + 1))
  else
    END_TIME=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    echo -e "${RED}FAILED${NC} (${ELAPSED_MS}ms)"
    FAILED=1
    echo ""
    echo -e "${RED}Migration failed at ${filename} — stopping.${NC}"
    exit 1
  fi
done

echo ""
echo "============================================="
if [ "$DRY_RUN" -eq 1 ]; then
  echo -e "  ${CYAN}Dry run complete${NC}"
  echo "  Migrations to run: ${TOTAL}"
  echo "  Skipped (--from):  ${SKIPPED}"
else
  echo -e "  ${GREEN}All ${SUCCEEDED} migration(s) completed successfully!${NC}"
  if [ "$SKIPPED" -gt 0 ]; then
    echo "  Skipped (--from):  ${SKIPPED}"
  fi
  echo "  Total time:        ${TOTAL_TIME}ms"
fi
echo "============================================="
