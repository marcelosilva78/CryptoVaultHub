#!/bin/bash
# =============================================================================
# CryptoVaultHub — Test Runner
# Runs all tests across the monorepo using Turborepo.
#
# Usage:
#   ./run-tests.sh                     # Run all tests
#   ./run-tests.sh --filter admin-api  # Run tests for a specific service
#   ./run-tests.sh --coverage          # Run with coverage report
# =============================================================================

set -euo pipefail

# ── Color codes ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

FILTER=""
COVERAGE=0
EXTRA_ARGS=""

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --filter)   FILTER="$2"; shift 2 ;;
    --coverage) COVERAGE=1; shift ;;
    *)          EXTRA_ARGS="${EXTRA_ARGS} $1"; shift ;;
  esac
done

# Navigate to monorepo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "============================================="
echo "  CryptoVaultHub — Test Runner"
echo "============================================="
if [ -n "$FILTER" ]; then
  echo "  Filter: ${FILTER}"
fi
if [ "$COVERAGE" -eq 1 ]; then
  echo "  Coverage: enabled"
fi
echo "============================================="
echo ""

# Build turbo command
CMD="npx turbo test"

if [ -n "$FILTER" ]; then
  CMD="${CMD} --filter=@cvh/${FILTER}"
else
  CMD="${CMD} --filter=@cvh/*"
fi

# Append Jest flags after --
CMD="${CMD} -- --passWithNoTests"

if [ "$COVERAGE" -eq 1 ]; then
  CMD="${CMD} --coverage"
fi

if [ -n "$EXTRA_ARGS" ]; then
  CMD="${CMD}${EXTRA_ARGS}"
fi

echo -e "${CYAN}Running:${NC} ${CMD}"
echo ""

START_TIME=$(date +%s)

cd "$ROOT_DIR"
if eval "$CMD"; then
  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))
  echo ""
  echo -e "${GREEN}All tests passed!${NC} (${ELAPSED}s)"
else
  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))
  echo ""
  echo -e "${RED}Some tests failed.${NC} (${ELAPSED}s)"
  exit 1
fi
