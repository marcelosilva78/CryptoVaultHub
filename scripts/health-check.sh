#!/bin/bash
# =============================================================================
# CryptoVaultHub — Health Check Script
# Checks health of all 9 CryptoVaultHub microservices.
#
# Usage:
#   ./health-check.sh                # Check all services (default: localhost)
#   ./health-check.sh --host 10.0.0.5 # Custom host
#   ./health-check.sh --timeout 10     # Custom timeout in seconds
# =============================================================================

set -euo pipefail

# ── Color codes ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

HOST="${CVH_HOST:-localhost}"
TIMEOUT=5

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)    HOST="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *)         echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# ── Service definitions ──────────────────────────────────────────────────────
declare -a SERVICES=(
  "admin-api:3001"
  "client-api:3002"
  "auth-service:3003"
  "core-wallet-service:3004"
  "key-vault-service:3005"
  "chain-indexer-service:3006"
  "notification-service:3007"
  "cron-worker-service:3008"
  "rpc-gateway-service:3009"
)

echo "============================================="
echo "  CryptoVaultHub — Service Health Check"
echo "============================================="
echo "  Host:    ${HOST}"
echo "  Timeout: ${TIMEOUT}s"
echo "============================================="
echo ""

TOTAL=${#SERVICES[@]}
HEALTHY=0
UNHEALTHY=0

for entry in "${SERVICES[@]}"; do
  SERVICE_NAME="${entry%%:*}"
  SERVICE_PORT="${entry##*:}"

  URL="http://${HOST}:${SERVICE_PORT}/health"
  printf "  %-28s " "${SERVICE_NAME} (:${SERVICE_PORT})"

  START_TIME=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$URL" 2>/dev/null || echo "000")

  END_TIME=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
  ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

  if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
    echo -e "${GREEN}HEALTHY${NC} (HTTP ${HTTP_STATUS}, ${ELAPSED_MS}ms)"
    HEALTHY=$((HEALTHY + 1))
  elif [ "$HTTP_STATUS" = "000" ]; then
    echo -e "${RED}UNREACHABLE${NC} (timeout/connection refused, ${ELAPSED_MS}ms)"
    UNHEALTHY=$((UNHEALTHY + 1))
  else
    echo -e "${RED}UNHEALTHY${NC} (HTTP ${HTTP_STATUS}, ${ELAPSED_MS}ms)"
    UNHEALTHY=$((UNHEALTHY + 1))
  fi
done

echo ""
echo "============================================="
echo "  Results: ${GREEN}${HEALTHY}${NC} healthy, ${RED}${UNHEALTHY}${NC} unhealthy (${TOTAL} total)"
echo "============================================="

if [ "$UNHEALTHY" -gt 0 ]; then
  exit 1
fi
