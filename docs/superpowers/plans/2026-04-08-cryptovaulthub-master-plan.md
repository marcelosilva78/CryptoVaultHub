# CryptoVaultHub — Master Implementation Plan

> **For agentic workers:** Each phase has its own detailed plan. Start with Phase 1 and proceed sequentially. Use superpowers:subagent-driven-development or superpowers:executing-plans for each phase.

**Goal:** Build a self-hosted, enterprise-grade EVM cryptocurrency wallet management platform for B2B clients (exchanges, payment gateways).

**Architecture:** Microservices (8 NestJS services) + smart contracts (Solidity, adapted from BitGo eth-multisig-v4) + 3 Next.js frontends, all containerized in Docker. MySQL for persistence, Redis for cache/queues, PostHog for business event traceability.

**Spec:** `docs/superpowers/specs/2026-04-08-cryptovaulthub-design.md`
**Mockups:** `mockups/admin-panel.html`, `mockups/client-panel.html`

---

## Phase Overview

| Phase | Plan File | Deliverable | Est. Tasks |
|-------|-----------|------------|-----------|
| 1 | `phase-01-foundation.md` | Monorepo, Docker, Smart Contracts (compiled + tested) | ~25 |
| 2 | `phase-02-keyvault-auth.md` | Key Vault Service, Auth Service | ~30 |
| 3 | `phase-03-core-wallet.md` | Core Wallet Service (wallet lifecycle, deposit addresses) | ~25 |
| 4 | `phase-04-chain-indexer.md` | Chain Indexer (block scanning, confirmation tracking) | ~20 |
| 5 | `phase-05-sweep-withdraw.md` | Cron workers, sweeps, withdrawals, gas management | ~20 |
| 6 | `phase-06-notifications.md` | Webhook delivery, email, retry/DLQ | ~15 |
| 7 | `phase-07-compliance.md` | KYT/OFAC screening, sanctions list sync | ~15 |
| 8 | `phase-08-api-gateway.md` | Kong config, rate limiting, tier sync | ~12 |
| 9 | `phase-09-observability.md` | PostHog integration, Prometheus, Grafana, Loki, Jaeger | ~15 |
| 10 | `phase-10-admin-panel.md` | Admin Panel (Next.js) | ~25 |
| 11 | `phase-11-client-portal.md` | Client Portal (Next.js) | ~25 |
| 12 | `phase-12-bi-dashboard.md` | BI Dashboard (Next.js) | ~15 |

## Execution Order

```
Phase 1 (Foundation)
    │
    ├── Phase 2 (Key Vault + Auth)
    │       │
    │       ├── Phase 3 (Core Wallet)
    │       │       │
    │       │       ├── Phase 4 (Chain Indexer)
    │       │       │       │
    │       │       │       └── Phase 5 (Sweep/Withdraw)
    │       │       │               │
    │       │       │               ├── Phase 7 (Compliance)
    │       │       │               │
    │       │       │               └── Phase 6 (Notifications)
    │       │       │
    │       │       └── Phase 8 (API Gateway)
    │       │
    │       └── Phase 9 (Observability)
    │
    └── Frontends (after backend phases):
        ├── Phase 10 (Admin Panel)
        ├── Phase 11 (Client Portal)
        └── Phase 12 (BI Dashboard)
```

## Conventions

- **Language:** TypeScript (strict mode) throughout
- **ORM:** Prisma with MySQL connector
- **Testing:** Jest + supertest (APIs), Hardhat test (Solidity)
- **Linting:** ESLint + Prettier (configured in Phase 1)
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`)
- **Branching:** `main` + feature branches per phase
- **Docker:** Each service gets a `Dockerfile` + entry in `docker-compose.yml`
