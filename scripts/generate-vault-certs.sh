#!/usr/bin/env bash
# =============================================================================
# generate-vault-certs.sh — Generate mTLS certificates for Key Vault <-> Core Wallet
#
# Certificate Chain:
#   Self-signed CA (cvh-vault-ca)
#   ├── Server cert (key-vault-service)
#   └── Client cert (core-wallet-service)
#
# Output directory: infra/vault-tls/
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${PROJECT_ROOT}/infra/vault-tls"

# Certificate validity periods
CA_DAYS=3650          # 10 years
SERVER_DAYS=825       # ~2.25 years (Apple/browser max)
CLIENT_DAYS=825

# Key sizes
KEY_BITS=4096

echo "=== CryptoVaultHub — Vault mTLS Certificate Generator ==="
echo "Output directory: ${OUT_DIR}"
echo ""

mkdir -p "${OUT_DIR}"

# ─── Step 1: CA key + self-signed certificate ─────────────────────────────────

if [[ -f "${OUT_DIR}/vault-ca.key" && -f "${OUT_DIR}/vault-ca.crt" ]]; then
  echo "[CA] Existing CA found. Skipping generation."
  echo "     Delete vault-ca.key + vault-ca.crt to regenerate."
else
  echo "[CA] Generating CA private key (${KEY_BITS}-bit RSA)..."
  openssl genrsa -out "${OUT_DIR}/vault-ca.key" ${KEY_BITS} 2>/dev/null

  echo "[CA] Generating self-signed CA certificate (${CA_DAYS} days)..."
  openssl req -new -x509 \
    -key "${OUT_DIR}/vault-ca.key" \
    -out "${OUT_DIR}/vault-ca.crt" \
    -days ${CA_DAYS} \
    -subj "/C=BR/ST=SP/O=CryptoVaultHub/OU=Infrastructure/CN=cvh-vault-ca" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"

  echo "[CA] CA certificate created."
fi

echo ""

# ─── Step 2: Server certificate (key-vault-service) ──────────────────────────

echo "[Server] Generating server private key (${KEY_BITS}-bit RSA)..."
openssl genrsa -out "${OUT_DIR}/vault-server.key" ${KEY_BITS} 2>/dev/null

echo "[Server] Creating certificate signing request..."
openssl req -new \
  -key "${OUT_DIR}/vault-server.key" \
  -out "${OUT_DIR}/vault-server.csr" \
  -subj "/C=BR/ST=SP/O=CryptoVaultHub/OU=KeyVault/CN=key-vault-service"

echo "[Server] Signing server certificate with CA (${SERVER_DAYS} days)..."
cat > "${OUT_DIR}/server-ext.cnf" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=key-vault-service
DNS.2=localhost
IP.1=127.0.0.1
EOF

openssl x509 -req \
  -in "${OUT_DIR}/vault-server.csr" \
  -CA "${OUT_DIR}/vault-ca.crt" \
  -CAkey "${OUT_DIR}/vault-ca.key" \
  -CAcreateserial \
  -out "${OUT_DIR}/vault-server.crt" \
  -days ${SERVER_DAYS} \
  -extfile "${OUT_DIR}/server-ext.cnf"

echo "[Server] Server certificate created."
echo ""

# ─── Step 3: Client certificate (core-wallet-service) ────────────────────────

echo "[Client] Generating client private key (${KEY_BITS}-bit RSA)..."
openssl genrsa -out "${OUT_DIR}/vault-client.key" ${KEY_BITS} 2>/dev/null

echo "[Client] Creating certificate signing request..."
openssl req -new \
  -key "${OUT_DIR}/vault-client.key" \
  -out "${OUT_DIR}/vault-client.csr" \
  -subj "/C=BR/ST=SP/O=CryptoVaultHub/OU=CoreWallet/CN=core-wallet-service"

echo "[Client] Signing client certificate with CA (${CLIENT_DAYS} days)..."
cat > "${OUT_DIR}/client-ext.cnf" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF

openssl x509 -req \
  -in "${OUT_DIR}/vault-client.csr" \
  -CA "${OUT_DIR}/vault-ca.crt" \
  -CAkey "${OUT_DIR}/vault-ca.key" \
  -CAcreateserial \
  -out "${OUT_DIR}/vault-client.crt" \
  -days ${CLIENT_DAYS} \
  -extfile "${OUT_DIR}/client-ext.cnf"

echo "[Client] Client certificate created."
echo ""

# ─── Cleanup temporary files ─────────────────────────────────────────────────

rm -f "${OUT_DIR}/vault-server.csr" "${OUT_DIR}/vault-client.csr"
rm -f "${OUT_DIR}/server-ext.cnf" "${OUT_DIR}/client-ext.cnf"
rm -f "${OUT_DIR}/vault-ca.srl"

# ─── Restrict permissions on private keys ─────────────────────────────────────

chmod 600 "${OUT_DIR}/vault-ca.key"
chmod 600 "${OUT_DIR}/vault-server.key"
chmod 600 "${OUT_DIR}/vault-client.key"
chmod 644 "${OUT_DIR}/vault-ca.crt"
chmod 644 "${OUT_DIR}/vault-server.crt"
chmod 644 "${OUT_DIR}/vault-client.crt"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo "=== Certificate generation complete ==="
echo ""
echo "Files created in ${OUT_DIR}/:"
echo "  vault-ca.key        — CA private key       (DO NOT COMMIT)"
echo "  vault-ca.crt        — CA certificate"
echo "  vault-server.key    — Server private key    (DO NOT COMMIT)"
echo "  vault-server.crt    — Server certificate"
echo "  vault-client.key    — Client private key    (DO NOT COMMIT)"
echo "  vault-client.crt    — Client certificate"
echo ""
echo "To enable mTLS, set VAULT_TLS_ENABLED=true in your .env file."
echo ""

# ─── Verify the certificates ──────────────────────────────────────────────────

echo "=== Verification ==="
echo ""
echo "CA certificate:"
openssl x509 -in "${OUT_DIR}/vault-ca.crt" -noout -subject -issuer -dates | sed 's/^/  /'
echo ""
echo "Server certificate:"
openssl x509 -in "${OUT_DIR}/vault-server.crt" -noout -subject -issuer -dates | sed 's/^/  /'
echo "  Verify against CA:"
openssl verify -CAfile "${OUT_DIR}/vault-ca.crt" "${OUT_DIR}/vault-server.crt" | sed 's/^/    /'
echo ""
echo "Client certificate:"
openssl x509 -in "${OUT_DIR}/vault-client.crt" -noout -subject -issuer -dates | sed 's/^/  /'
echo "  Verify against CA:"
openssl verify -CAfile "${OUT_DIR}/vault-ca.crt" "${OUT_DIR}/vault-client.crt" | sed 's/^/    /'
echo ""
echo "Done."
