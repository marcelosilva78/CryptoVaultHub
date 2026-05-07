# API Reference — CryptoVaultHub Client API

Last updated: 2026-05-07 (from `automation/evidence/2026-05-07T23-52-53-392Z`).

## Files
- [`curl-examples.md`](./curl-examples.md) — canonical curl reference for every endpoint exercised by the homologation suite.
- [`curl-log-detailed.md`](./curl-log-detailed.md) — full chronological log with attempts and adaptation notes.
- [`replay.sh`](./replay.sh) — standalone bash script that reproduces the entire flow.
- [`last-homolog-report.md`](./last-homolog-report.md) — PASS/FAIL summary of the most recent run.

## How to regenerate
```bash
cd docs/superpowers/automation
pnpm homolog                # run the suite
pnpm promote                # copy latest evidence into this folder
```

## Postman collection
See [`../postman/`](../postman/) for the importable Postman collection. The endpoint shapes there should match the curl examples here.
