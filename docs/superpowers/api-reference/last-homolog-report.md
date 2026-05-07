# CryptoVaultHub Homologation Report
**Date:** 2026-05-07T23:52:56.082Z
**Duration:** 2.7s

| Status | Count |
|---|---|
| PASS | 5 |
| FAIL | 1 |
| WARN | 2 |
| SKIP | 0 |

## B — API Integration Suite (e2e)

| Step | Status | Time | Note |
|---|---|---|---|
| Resolve project "BrPay" | PASS | 351ms |  |
| List wallets (gas_tank + hot) | PASS | 224ms |  |
| Confirm gas tank status = ok | PASS | 540ms |  |
| webhook | WARN | 0ms | CVH_WEBHOOK_URL not set — generating disposable receiver via webhook.site |
| Register webhook receiver | PASS | 178ms |  |
| webhook-test | WARN | 0ms | POST /webhooks/:id/test ainda não implementado downstream — pulando |
| Send webhook test ping | PASS | 139ms |  |
| Generate deposit address (forwarder) | FAIL | 315ms | POST /wallets/56/deposit-address → 500 {"statusCode":500,"message":"Internal server error"} |
