#!/usr/bin/env bash
# =============================================================================
# CryptoVaultHub — SSL Certificate Initialization
# Obtains Let's Encrypt certificates for all subdomains.
# Run AFTER DNS records are pointing to this server.
#
# Usage: bash scripts/init-ssl.sh [domain]
# =============================================================================

set -euo pipefail

DOMAIN="${1:-vaulthub.live}"
EMAIL="${2:-admin@$DOMAIN}"

echo "=== CryptoVaultHub SSL Setup ==="
echo "Domain: $DOMAIN"
echo "Subdomains: admin.$DOMAIN, portal.$DOMAIN, api.$DOMAIN, grafana.$DOMAIN, jaeger.$DOMAIN"
echo "Email: $EMAIL"
echo ""

# Step 1: Start nginx with initial config (HTTP only, for ACME challenge)
echo "[1/4] Starting Nginx with HTTP-only config for ACME challenge..."
cp infra/nginx/nginx-initial.conf infra/nginx/nginx.conf.bak
cp infra/nginx/nginx-initial.conf infra/nginx/nginx-active.conf

docker compose up -d nginx
sleep 3

# Step 2: Request certificate
echo "[2/4] Requesting Let's Encrypt certificate..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "admin.$DOMAIN" \
  -d "portal.$DOMAIN" \
  -d "api.$DOMAIN" \
  -d "grafana.$DOMAIN" \
  -d "jaeger.$DOMAIN"

# Step 3: Restore full nginx config with SSL
echo "[3/4] Switching to full SSL Nginx config..."
cp infra/nginx/nginx.conf infra/nginx/nginx-active.conf

# Step 4: Reload nginx
echo "[4/4] Reloading Nginx with SSL..."
docker compose restart nginx

echo ""
echo "=== SSL Setup Complete ==="
echo "  https://admin.$DOMAIN"
echo "  https://portal.$DOMAIN"
echo "  https://api.$DOMAIN"
echo "  https://grafana.$DOMAIN"
echo "  https://jaeger.$DOMAIN"
echo ""
echo "Certificates will auto-renew via certbot container."
