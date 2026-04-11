#!/usr/bin/env bash
# =============================================================================
# CryptoVaultHub v2 — Setup Script
# Configures environment, runs migrations on external MySQL cluster,
# and starts all services via Docker Compose.
#
# Prerequisites:
#   - Docker + Docker Compose installed
#   - External MySQL cluster accessible from this machine
#   - mysql client installed (for migrations)
#
# Usage:
#   bash scripts/setup.sh
#   bash scripts/setup.sh --skip-migrations   # Skip DB migrations
#   bash scripts/setup.sh --env-only          # Only generate .env file
#   bash scripts/setup.sh --teardown          # Stop and remove containers
# =============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${CYAN}[CVH]${NC} $1"; }
ok()     { echo -e "${GREEN}[OK]${NC} $1"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()   { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
header() { echo -e "\n${BOLD}═══════════════════════════════════════════════════${NC}"; echo -e "${BOLD}  $1${NC}"; echo -e "${BOLD}═══════════════════════════════════════════════════${NC}\n"; }

# ─── Parse Arguments ─────────────────────────────────────────────────────────
SKIP_MIGRATIONS=false
ENV_ONLY=false
TEARDOWN=false

for arg in "$@"; do
  case $arg in
    --skip-migrations) SKIP_MIGRATIONS=true ;;
    --env-only)        ENV_ONLY=true ;;
    --teardown)        TEARDOWN=true ;;
    --help|-h)
      echo "Usage: bash scripts/setup.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --skip-migrations   Skip database migrations"
      echo "  --env-only          Only generate .env file, don't start services"
      echo "  --teardown          Stop and remove all containers"
      echo "  -h, --help          Show this help"
      exit 0
      ;;
    *) warn "Unknown argument: $arg" ;;
  esac
done

# ─── Teardown ────────────────────────────────────────────────────────────────
if [ "$TEARDOWN" = true ]; then
  header "Tearing Down CryptoVaultHub"
  docker compose down -v --remove-orphans 2>/dev/null || true
  ok "All containers stopped and removed"
  exit 0
fi

# ─── Pre-flight Checks ──────────────────────────────────────────────────────
header "Pre-flight Checks"

command -v docker >/dev/null 2>&1 || fail "Docker is not installed"
ok "Docker installed: $(docker --version | head -1)"

docker compose version >/dev/null 2>&1 || fail "Docker Compose is not installed"
ok "Docker Compose installed: $(docker compose version | head -1)"

command -v mysql >/dev/null 2>&1 || warn "mysql client not found — migrations will need to be run manually"
MYSQL_CLIENT_AVAILABLE=$(command -v mysql >/dev/null 2>&1 && echo true || echo false)

# ─── Configure Docker Data Root on /docker ──────────────────────────────────
header "Docker Storage Configuration (/docker)"

if [ -d "/docker" ]; then
  ok "/docker mount point exists"
else
  warn "/docker does not exist — will use default Docker storage"
  warn "For production, mount an LVM volume at /docker"
fi

if [ -d "/docker" ]; then
  # Create directory structure on the LVM volume
  log "Creating directory structure on /docker..."
  sudo mkdir -p /docker/lib                    # Docker daemon data-root (images, containers, overlays)
  sudo mkdir -p /docker/data/redis             # Redis AOF persistence
  sudo mkdir -p /docker/data/prometheus        # Prometheus TSDB
  sudo mkdir -p /docker/data/grafana           # Grafana dashboards + plugins
  sudo mkdir -p /docker/data/traefik/letsencrypt # SSL certificates
  sudo mkdir -p /docker/data/exports           # Export file storage
  sudo mkdir -p /docker/data/posthog-postgres  # PostHog PostgreSQL
  sudo mkdir -p /docker/data/clickhouse        # ClickHouse analytics
  sudo chown -R 472:472 /docker/data/grafana   # Grafana runs as UID 472
  sudo chown -R 65534:65534 /docker/data/prometheus  # Prometheus runs as nobody
  ok "Directory structure created on /docker"

  # Configure Docker daemon to use /docker/lib as data-root
  DAEMON_JSON="/etc/docker/daemon.json"
  if [ -f "$DAEMON_JSON" ]; then
    if grep -q "/docker/lib" "$DAEMON_JSON" 2>/dev/null; then
      ok "Docker data-root already set to /docker/lib"
    else
      warn "Existing $DAEMON_JSON found — backing up and updating"
      sudo cp "$DAEMON_JSON" "${DAEMON_JSON}.backup.$(date +%Y%m%d%H%M%S)"
      sudo cp infra/docker/daemon.json "$DAEMON_JSON"
      log "Restarting Docker daemon to apply new data-root..."
      sudo systemctl restart docker
      ok "Docker data-root set to /docker/lib"
    fi
  else
    sudo cp infra/docker/daemon.json "$DAEMON_JSON"
    log "Restarting Docker daemon to apply new data-root..."
    sudo systemctl restart docker
    ok "Docker daemon configured with data-root=/docker/lib"
  fi
fi

# ─── Secret Generation Helpers ───────────────────────────────────────────────
generate_secret()  { openssl rand -base64 "$1" 2>/dev/null | tr -d '/+=' | head -c "$1"; }
generate_hex()     { openssl rand -hex "$1" 2>/dev/null; }

# ─── Collect MySQL Cluster Credentials ───────────────────────────────────────
header "MySQL Cluster Configuration"

if [ -f .env ]; then
  log "Existing .env file found. Loading MySQL settings..."
  source <(grep -E '^MYSQL_(HOST|PORT|USER|PASSWORD|ROOT_PASSWORD)=' .env 2>/dev/null || true)
fi

# Prompt for MySQL credentials (with defaults from existing .env or empty)
read -rp "$(echo -e "${CYAN}MySQL Host${NC} [${MYSQL_HOST:-}]: ")" input_host
MYSQL_HOST="${input_host:-${MYSQL_HOST:-}}"
[ -z "$MYSQL_HOST" ] && fail "MySQL host is required"

read -rp "$(echo -e "${CYAN}MySQL Port${NC} [${MYSQL_PORT:-3306}]: ")" input_port
MYSQL_PORT="${input_port:-${MYSQL_PORT:-3306}}"

read -rp "$(echo -e "${CYAN}MySQL Admin User${NC} [${MYSQL_USER:-root}]: ")" input_user
MYSQL_USER="${input_user:-${MYSQL_USER:-root}}"

read -srp "$(echo -e "${CYAN}MySQL Admin Password${NC}: ")" input_password
echo ""
MYSQL_PASSWORD="${input_password:-${MYSQL_PASSWORD:-}}"
[ -z "$MYSQL_PASSWORD" ] && fail "MySQL password is required"

# Test MySQL connection
log "Testing MySQL connection..."
if [ "$MYSQL_CLIENT_AVAILABLE" = true ]; then
  mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1;" >/dev/null 2>&1 \
    && ok "MySQL connection successful" \
    || fail "Cannot connect to MySQL at $MYSQL_HOST:$MYSQL_PORT with user $MYSQL_USER"
else
  warn "mysql client not available — skipping connection test"
fi

# ─── Domain + SSL Configuration ─────────────────────────────────────────────
header "Domain & SSL Configuration"

read -rp "$(echo -e "${CYAN}Base domain${NC} [vaulthub.live]: ")" input_domain
BASE_DOMAIN="${input_domain:-vaulthub.live}"

read -rp "$(echo -e "${CYAN}Cloudflare DNS API Token${NC} (for SSL certificates): ")" input_cf_token
CLOUDFLARE_DNS_API_TOKEN="${input_cf_token:-}"
[ -z "$CLOUDFLARE_DNS_API_TOKEN" ] && warn "No Cloudflare token — SSL certificates will NOT be provisioned"
[ -n "$CLOUDFLARE_DNS_API_TOKEN" ] && ok "Cloudflare DNS API token configured"

# ─── Collect Optional Settings ───────────────────────────────────────────────
header "Optional Configuration"

read -rp "$(echo -e "${CYAN}Tatum API Key${NC} [leave empty to skip]: ")" TATUM_API_KEY
TATUM_API_KEY="${TATUM_API_KEY:-}"

read -rp "$(echo -e "${CYAN}Grafana admin password${NC} [auto-generate]: ")" GRAFANA_PASSWORD_INPUT
GRAFANA_PASSWORD="${GRAFANA_PASSWORD_INPUT:-$(generate_secret 16)}"

read -rp "$(echo -e "${CYAN}Export file storage path${NC} [/data/exports]: ")" EXPORT_PATH_INPUT
EXPORT_STORAGE_PATH="${EXPORT_PATH_INPUT:-/data/exports}"

# ─── Generate Secrets ────────────────────────────────────────────────────────
header "Generating Cryptographic Secrets"

REDIS_PASSWORD=$(generate_secret 32)
ok "Redis password generated (32 chars)"

VAULT_MASTER_PASSWORD=$(generate_secret 48)
ok "Vault master password generated (48 chars)"

INTERNAL_SERVICE_KEY=$(generate_hex 32)
ok "Internal service key generated (64 hex chars)"

JWT_SECRET=$(generate_secret 48)
ok "JWT secret generated (48 chars)"

TOTP_ENCRYPTION_KEY=$(generate_hex 32)
ok "TOTP encryption key generated (64 hex chars)"

# ─── Generate .env File ─────────────────────────────────────────────────────
header "Generating .env File"

# Backup existing .env if present
[ -f .env ] && cp .env ".env.backup.$(date +%Y%m%d%H%M%S)" && warn "Existing .env backed up"

cat > .env << ENVEOF
# =============================================================================
# CryptoVaultHub v2 — Environment Configuration
# Generated by scripts/setup.sh at $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# =============================================================================

# ─── Domain ─────────────────────────────────────────────────────────────────
BASE_DOMAIN=${BASE_DOMAIN}

# ─── Cloudflare (SSL via DNS-01 challenge) ──────────────────────────────────
CLOUDFLARE_DNS_API_TOKEN=${CLOUDFLARE_DNS_API_TOKEN}

# ─── MySQL Cluster (External) ───────────────────────────────────────────────
MYSQL_HOST=${MYSQL_HOST}
MYSQL_PORT=${MYSQL_PORT}
MYSQL_USER=${MYSQL_USER}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
MYSQL_ROOT_PASSWORD=${MYSQL_PASSWORD}

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# ─── Key Vault ───────────────────────────────────────────────────────────────
VAULT_MASTER_PASSWORD=${VAULT_MASTER_PASSWORD}

# ─── Inter-service Authentication ────────────────────────────────────────────
INTERNAL_SERVICE_KEY=${INTERNAL_SERVICE_KEY}

# ─── JWT / Auth ──────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=7
TOTP_ENCRYPTION_KEY=${TOTP_ENCRYPTION_KEY}

# ─── Monitoring ──────────────────────────────────────────────────────────────
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}

# ─── RPC Endpoints ───────────────────────────────────────────────────────────
RPC_ETH_HTTP=https://eth-mainnet.gateway.tatum.io/
RPC_ETH_WS=wss://eth-mainnet.gateway.tatum.io/ws
RPC_BSC_HTTP=https://bsc-mainnet.gateway.tatum.io/
RPC_BSC_WS=wss://bsc-mainnet.gateway.tatum.io/ws
RPC_POLYGON_HTTP=https://polygon-mainnet.gateway.tatum.io/
TATUM_API_KEY=${TATUM_API_KEY}

# ─── PostHog ─────────────────────────────────────────────────────────────────
POSTHOG_HOST=http://posthog-web:8000
POSTHOG_API_KEY=

# ─── Kong ────────────────────────────────────────────────────────────────────
KONG_ADMIN_URL=http://api-gateway:8001

# ─── RPC Gateway ─────────────────────────────────────────────────────────────
RPC_GATEWAY_URL=http://rpc-gateway-service:3009

# ─── Jobs Database (same MySQL cluster, separate database) ───────────────────
CVH_JOBS_MYSQL_HOST=${MYSQL_HOST}
CVH_JOBS_MYSQL_PORT=${MYSQL_PORT}
CVH_JOBS_MYSQL_USER=${MYSQL_USER}
CVH_JOBS_MYSQL_PASSWORD=${MYSQL_PASSWORD}
CVH_JOBS_MYSQL_DATABASE=cvh_jobs

# ─── Exports Database (same MySQL cluster, separate database) ────────────────
CVH_EXPORTS_MYSQL_HOST=${MYSQL_HOST}
CVH_EXPORTS_MYSQL_PORT=${MYSQL_PORT}
CVH_EXPORTS_MYSQL_USER=${MYSQL_USER}
CVH_EXPORTS_MYSQL_PASSWORD=${MYSQL_PASSWORD}
CVH_EXPORTS_MYSQL_DATABASE=cvh_exports

# ─── Export Storage ──────────────────────────────────────────────────────────
EXPORT_STORAGE_PATH=${EXPORT_STORAGE_PATH}
EXPORT_MAX_ROWS_SYNC=1000
EXPORT_FILE_EXPIRY_HOURS=24

# ─── Frontend URLs ───────────────────────────────────────────────────────────
NEXT_PUBLIC_AUTH_API_URL=https://api.${BASE_DOMAIN}/auth
NEXT_PUBLIC_ADMIN_API_URL=https://api.${BASE_DOMAIN}/admin
NEXT_PUBLIC_CLIENT_API_URL=https://api.${BASE_DOMAIN}/client
ENVEOF

ok ".env file generated with all $(grep -c '=' .env) variables"

if [ "$ENV_ONLY" = true ]; then
  ok "Environment file generated. Exiting (--env-only mode)."
  exit 0
fi

# ─── Run Migrations ──────────────────────────────────────────────────────────
if [ "$SKIP_MIGRATIONS" = false ] && [ "$MYSQL_CLIENT_AVAILABLE" = true ]; then
  header "Running Database Migrations"

  MIGRATION_DIR="database"
  MIGRATION_COUNT=0
  MIGRATION_ERRORS=0

  for sql_file in $(ls "$MIGRATION_DIR"/0*.sql | sort); do
    filename=$(basename "$sql_file")
    log "Running ${BOLD}$filename${NC}..."

    START_TIME=$(date +%s%N)

    if mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
         --default-character-set=utf8mb4 < "$sql_file" 2>/tmp/cvh_migration_err; then
      END_TIME=$(date +%s%N)
      DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
      ok "$filename (${DURATION}ms)"
      MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    else
      END_TIME=$(date +%s%N)
      DURATION=$(( (END_TIME - START_TIME) / 1000000 ))
      ERR_MSG=$(cat /tmp/cvh_migration_err 2>/dev/null | head -3)

      # Ignore "database/table already exists" errors (idempotent)
      if echo "$ERR_MSG" | grep -qE "already exists|Duplicate"; then
        warn "$filename — already applied (${DURATION}ms)"
        MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
      else
        echo -e "${RED}[FAIL]${NC} $filename (${DURATION}ms)"
        echo "  Error: $ERR_MSG"
        MIGRATION_ERRORS=$((MIGRATION_ERRORS + 1))
      fi
    fi
  done

  rm -f /tmp/cvh_migration_err

  echo ""
  if [ $MIGRATION_ERRORS -eq 0 ]; then
    ok "All $MIGRATION_COUNT migrations applied successfully"
  else
    warn "$MIGRATION_COUNT succeeded, $MIGRATION_ERRORS failed"
  fi
elif [ "$SKIP_MIGRATIONS" = true ]; then
  warn "Skipping migrations (--skip-migrations flag)"
else
  warn "mysql client not available — run migrations manually:"
  echo "  bash database/migrate.sh"
fi

# ─── Create Export Storage Directory ─────────────────────────────────────────
header "Preparing File Storage"

mkdir -p "$EXPORT_STORAGE_PATH" 2>/dev/null || warn "Could not create $EXPORT_STORAGE_PATH (may need sudo)"
ok "Export storage: $EXPORT_STORAGE_PATH"

# ─── Start Services ──────────────────────────────────────────────────────────
header "Starting Docker Compose Services"

log "Building and starting all services..."
log "(This may take several minutes on first run)"
echo ""

docker compose up -d --build 2>&1 | while IFS= read -r line; do
  echo -e "  ${CYAN}|${NC} $line"
done

# ─── Wait for Services to be Healthy ─────────────────────────────────────────
header "Waiting for Services to be Healthy"

SERVICES=(
  "redis:internal"
  "api-gateway:8000"
  "admin-api:3001"
  "client-api:3002"
  "auth-service:3003"
  "core-wallet-service:3004"
  "key-vault-service:3005"
  "chain-indexer-service:3006"
  "notification-service:3007"
  "cron-worker-service:3008"
)

MAX_WAIT=120
ELAPSED=0
ALL_HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
  HEALTHY_COUNT=0
  TOTAL=${#SERVICES[@]}

  for svc_entry in "${SERVICES[@]}"; do
    svc_name="${svc_entry%%:*}"
    svc_port="${svc_entry##*:}"

    if [ "$svc_port" = "internal" ]; then
      # Check container health status
      status=$(docker compose ps --format json "$svc_name" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null || echo "")
      [ "$status" = "healthy" ] && HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
    else
      # Check HTTP health
      curl -sf "http://localhost:$svc_port/health" >/dev/null 2>&1 && HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
    fi
  done

  echo -ne "\r  ${CYAN}Health check:${NC} $HEALTHY_COUNT/$TOTAL services healthy (${ELAPSED}s elapsed)  "

  if [ $HEALTHY_COUNT -eq $TOTAL ]; then
    ALL_HEALTHY=true
    break
  fi

  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

echo ""
echo ""

if [ "$ALL_HEALTHY" = true ]; then
  ok "All services are healthy!"
else
  warn "Some services are not healthy after ${MAX_WAIT}s. Check logs with: docker compose logs <service>"
fi

# ─── Show Service Status ─────────────────────────────────────────────────────
header "Service Status"

docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

# ─── Print Access Information ────────────────────────────────────────────────
header "Access Information"

echo -e "  ${BOLD}API Gateway (Kong)${NC}"
echo -e "    API:           ${GREEN}https://api.${BASE_DOMAIN}${NC}"
echo -e "    Admin API:     ${GREEN}https://api.${BASE_DOMAIN}/admin${NC}"
echo -e "    Client API:    ${GREEN}https://api.${BASE_DOMAIN}/client/v1${NC}"
echo -e "    Auth API:      ${GREEN}https://api.${BASE_DOMAIN}/auth${NC}"
echo ""
echo -e "  ${BOLD}Frontend Portals${NC}"
echo -e "    Admin Panel:   ${GREEN}https://admin.${BASE_DOMAIN}${NC}"
echo -e "    Client Portal: ${GREEN}https://portal.${BASE_DOMAIN}${NC}"
echo ""
echo -e "  ${BOLD}Monitoring${NC}"
echo -e "    Grafana:       ${GREEN}https://grafana.${BASE_DOMAIN}${NC}  (admin / ${GRAFANA_PASSWORD})"
echo -e "    Jaeger:        ${GREEN}https://jaeger.${BASE_DOMAIN}${NC}"
echo ""
echo -e "  ${BOLD}MySQL Cluster${NC}"
echo -e "    Host:          ${GREEN}${MYSQL_HOST}:${MYSQL_PORT}${NC}"
echo -e "    Databases:     cvh_auth, cvh_keyvault, cvh_admin, cvh_wallets,"
echo -e "                   cvh_transactions, cvh_compliance, cvh_notifications,"
echo -e "                   cvh_indexer, cvh_jobs, cvh_exports"
echo ""
echo -e "  ${BOLD}Generated Secrets${NC}"
echo -e "    All secrets are stored in ${GREEN}.env${NC} file"
echo -e "    ${RED}Keep this file secure — it contains all cryptographic keys${NC}"
echo ""

header "Setup Complete!"
echo -e "  SSL certificates are provisioned automatically by Traefik (Let's Encrypt)."
echo -e "  Ensure DNS records point to this server before accessing HTTPS URLs."
echo -e ""
echo -e "  Next steps:"
echo -e "  1. Configure RPC providers in the Admin Panel (https://admin.${BASE_DOMAIN})"
echo -e "  2. Create your first client via Admin API"
echo -e "  4. Run health check: ${CYAN}bash scripts/health-check.sh${NC}"
echo -e "  5. Check logs: ${CYAN}docker compose logs -f <service>${NC}"
echo ""
