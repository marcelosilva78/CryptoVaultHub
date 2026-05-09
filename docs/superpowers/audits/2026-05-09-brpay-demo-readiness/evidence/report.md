# CryptoVaultHub Homologation Report
**Date:** 2026-05-09T11:05:17.459Z
**Duration:** 101.1s

| Status | Count |
|---|---|
| PASS | 46 |
| FAIL | 1 |
| WARN | 4 |
| SKIP | 2 |

## 0 — Auth & meta

| Step | Status | Time | Note |
|---|---|---|---|
| GET /health (no auth) | PASS | 1991ms |  |
| GET /chains | PASS | 1278ms |  |
| GET /tokens (authenticated, post-fix #1) | PASS | 1301ms |  |
| GET /tokens/56 | PASS | 1351ms |  |

## 1 — Project context

| Step | Status | Time | Note |
|---|---|---|---|
| Resolve project "BrPay" | PASS | 1425ms |  |
| GET /projects/current (auto-select single project) | PASS | 1183ms |  |
| GET /projects/6998 | PASS | 1261ms |  |
| GET /projects/6998/gas-check | PASS | 2470ms |  |
| GET /projects/6998/deploy/status | PASS | 1276ms |  |
| GET /projects/6998/deploy/traces | PASS | 1545ms |  |
| GET /projects/6998/deploy/traces/56 | PASS | 1719ms |  |
| GET /projects/6998/deletion-impact | PASS | 1862ms |  |
| GET /projects/6998/export | PASS | 1341ms |  |

## 2 — Wallets

| Step | Status | Time | Note |
|---|---|---|---|
| GET /wallets | PASS | 1530ms |  |
| GET /wallets/56/balances | PASS | 1778ms |  |

## 3 — Gas Tank

| Step | Status | Time | Note |
|---|---|---|---|
| GET /gas-tanks | PASS | 1710ms |  |
| GET /gas-tanks/56/history | PASS | 1215ms |  |
| GET /gas-tanks/56/topup-uri | PASS | 1203ms |  |
| GET /gas-tanks/56/alert-config | PASS | 1224ms |  |

## 4 — Deposit addresses

| Step | Status | Time | Note |
|---|---|---|---|
| GET /deposit-addresses | PASS | 1180ms |  |
| POST /wallets/:chainId/deposit-address (unique externalId per run) | PASS | 1653ms |  |
| GET /deposits (list) | PASS | 3134ms |  |

## 5 — Withdrawals (read)

| Step | Status | Time | Note |
|---|---|---|---|
| GET /withdrawals (list) | PASS | 1205ms |  |
| fix #2 dependency | WARN | 0ms | sourceWallet field absent from withdrawal detail response — defaults to "hot" in approve check |
| GET /withdrawals/12 | PASS | 1357ms |  |

## 6 — Address Book

| Step | Status | Time | Note |
|---|---|---|---|
| GET /addresses | PASS | 223ms |  |

## 7 — Address Groups

| Step | Status | Time | Note |
|---|---|---|---|
| GET /address-groups | PASS | 1198ms |  |

## 8 — Webhooks (lifecycle)

| Step | Status | Time | Note |
|---|---|---|---|
| GET /webhooks | PASS | 1352ms |  |
| Generate disposable webhook URL | PASS | 935ms |  |
| POST /webhooks (create) | PASS | 1442ms |  |
| webhook-test | WARN | 0ms | endpoint returns 404 (downstream gap) |
| POST /webhooks/17/test (ping) | PASS | 1197ms |  |
| GET /webhooks/17/deliveries | PASS | 1268ms |  |
| GET /webhooks/dead-letters | PASS | 1206ms |  |
| PATCH webhook downstream | WARN | 0ms | notification-service rejects clientId in body — proxy bug |
| PATCH /webhooks/17 (deactivate) | PASS | 1268ms |  |
| DELETE /webhooks/17 (cleanup) | PASS | 1905ms |  |

## 9 — Co-Sign

| Step | Status | Time | Note |
|---|---|---|---|
| GET /co-sign/pending | PASS | 1210ms |  |

## 10 — Security

| Step | Status | Time | Note |
|---|---|---|---|
| GET /security/settings | PASS | 261ms |  |
| GET /security/2fa-status | PASS | 1216ms |  |
| GET /security/shamir-shares | PASS | 1254ms |  |

## 11 — Notifications

| Step | Status | Time | Note |
|---|---|---|---|
| GET /notifications/rules | PASS | 1208ms |  |

## 12 — Knowledge Base

| Step | Status | Time | Note |
|---|---|---|---|
| GET /knowledge-base/categories | PASS | 1327ms |  |
| GET /knowledge-base | PASS | 215ms |  |
| GET /knowledge-base/slug/:slug | SKIP | 0ms | no articles to read |

## 13 — Deploy Traces

| Step | Status | Time | Note |
|---|---|---|---|
| deploy-traces 500 | WARN | 0ms | downstream service returns 500 — pre-existing bug, document as follow-up |
| GET /deploy-traces | PASS | 1233ms |  |
| GET /deploy-traces/:id | SKIP | 0ms | no traces to read |

## 14 — Exports

| Step | Status | Time | Note |
|---|---|---|---|
| POST /exports (small JSON withdrawals export) | FAIL | 19985ms | POST /exports → 500 {"statusCode":500,"message":"Internal server error"} |
| GET /exports (list) | PASS | 22439ms |  |

## 15 — Negative tests

| Step | Status | Time | Note |
|---|---|---|---|
| Fix #1 verification — GET /tokens without auth → 401 | PASS | 1306ms |  |
| JWT-only enforcement — GET /api-keys with X-API-Key → 401 | PASS | 99ms |  |
| JWT-only enforcement — POST /api-keys with X-API-Key → 401 | PASS | 112ms |  |
