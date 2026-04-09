#!/bin/bash
# =============================================================================
# CryptoVaultHub — Database Migration Runner
# Runs all SQL migration scripts in order against a MySQL 8+ instance.
#
# Usage:
#   ./migrate.sh                          # Uses defaults (localhost:3306, root)
#   ./migrate.sh -h 10.0.0.5 -u admin -p # Custom host/user, prompt password
#
# Environment variables (override defaults):
#   MYSQL_HOST  — MySQL host (default: localhost)
#   MYSQL_PORT  — MySQL port (default: 3306)
#   MYSQL_USER  — MySQL user (default: root)
# =============================================================================

set -euo pipefail

MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASS_FLAG=""

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--host)   MYSQL_HOST="$2"; shift 2 ;;
    -P|--port)   MYSQL_PORT="$2"; shift 2 ;;
    -u|--user)   MYSQL_USER="$2"; shift 2 ;;
    -p|--password) MYSQL_PASS_FLAG="-p"; shift ;;
    *)           echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================="
echo "  CryptoVaultHub — Database Migration"
echo "============================================="
echo "  Host: ${MYSQL_HOST}:${MYSQL_PORT}"
echo "  User: ${MYSQL_USER}"
echo "============================================="
echo ""

FAILED=0
for file in "${SCRIPT_DIR}"/0*.sql; do
  filename="$(basename "$file")"
  echo -n "  Running ${filename}... "
  if mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" $MYSQL_PASS_FLAG < "$file" 2>&1; then
    echo "OK"
  else
    echo "FAILED"
    FAILED=1
    break
  fi
done

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "All migrations completed successfully!"
else
  echo "Migration failed — see error above."
  exit 1
fi
