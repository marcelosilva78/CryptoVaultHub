import { initTracing } from '@cvh/config';
initTracing('client-api');

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('ClientApi');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('CryptoVaultHub Client API')
    .setDescription(`
## Overview
The CryptoVaultHub Client API enables client organizations to manage wallets, generate deposit addresses, initiate withdrawals, configure webhooks, and track transactions programmatically.

## Authentication
Most endpoints require API key authentication via the \`X-API-Key\` header. Self-service API key management endpoints (\`/client/v1/api-keys\`) require portal session authentication (JWT cookie) and reject API-key auth to prevent privilege escalation. API keys are created through the Client Portal at https://app.vaulthub.live.

### API Key Scopes (granular, since 2026-05-09)

Keys carry one or more of 31 granular \`resource:action\` scopes. Each endpoint declares the exact scope it requires (see the \`[scope:name]\` suffix on every operation summary).

**Examples:**
- \`wallets:read\`, \`deposits:read\`, \`withdrawals:read\` — read access per resource
- \`forwarders:create\`, \`forwarders:flush\` — distinct write actions on forwarders
- \`withdrawals:hot\` vs \`withdrawals:gas-tank\` — different source wallets, different scopes
- \`address-book:write\`, \`webhooks:write\`, \`gas-tanks:write\`, \`security:write\` — sensitive mutations

Full scope catalog and best practices: see the Knowledge Base article *"API Keys — escopo granular e melhores práticas"* in the Client Portal.

**Legacy macros** (\`read\` / \`write\` / \`withdraw\`) issued before 2026-05-09 keep working — they expand transparently to their granular equivalents at validation time. New keys created via the self-service portal must use granular scopes.

**IP allowlist (CIDR-aware):** keys may be restricted to one or more IPs/CIDRs. Requests from outside the allowlist return 401.
**Expiration:** keys may be created with an optional \`expiresAt\`. Expired keys return 401 immediately.

### Example Request
\`\`\`bash
curl -X GET https://api.vaulthub.live/client/v1/wallets \\
  -H "X-API-Key: cvh_sk_live_abc123def456..."
\`\`\`

## Rate Limiting
Rate limits are enforced per-client based on tier configuration:

| Tier | Global (req/s) | Example Endpoint Limits (req/min) |
|------|---------------|-----------------------------------|
| Starter | 60 | Deposit addresses: 10, Withdrawals: 5 |
| Business | 300 | Deposit addresses: 50, Withdrawals: 30 |
| Enterprise | 1,000 | Deposit addresses: 200, Withdrawals: 100 |

**Response headers** (included on every authenticated response):
- \`X-RateLimit-Limit\` — Your tier's per-second limit
- \`X-RateLimit-Remaining\` — Remaining requests in the current window
- \`X-RateLimit-Reset\` — Unix epoch when the window resets
- \`Retry-After\` — Seconds to wait (only on 429 responses)

Custom limits can be configured per-client via tier overrides. Contact support to upgrade your tier.

## Pagination
List endpoints support cursor-based pagination:
\`\`\`json
{
  "success": true,
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
\`\`\`

## Webhook Events
When configured, the system sends signed webhook notifications for:
- \`deposit.detected\` — New deposit detected on-chain
- \`deposit.confirmed\` — Deposit reached required confirmations
- \`deposit.swept\` — Deposited funds swept to hot wallet
- \`forwarder.deployed\` — New forwarder contract deployed
- \`gas_tank.low_balance\` — Gas tank balance dropped below configured threshold
- \`withdrawal.submitted\` — Withdrawal transaction broadcasted
- \`withdrawal.confirmed\` — Withdrawal confirmed on-chain
- \`withdrawal.failed\` — Withdrawal failed

### Webhook Signature Verification
All webhooks are signed with HMAC-SHA256. Verify using:
\`\`\`javascript
const crypto = require('crypto');
const signature = crypto.createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
const isValid = signature === request.headers['x-cvh-signature'];
\`\`\`

## Error Codes
| Code | Description |
|------|-------------|
| 400 | Invalid request body or parameters |
| 401 | Missing or invalid API key |
| 403 | Insufficient API key scope |
| 404 | Resource not found |
| 409 | Duplicate resource (idempotency key) |
| 422 | Business rule violation (e.g., insufficient balance) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
    `)
    .setVersion('1.0.0')
    .setContact('CryptoVaultHub', 'https://github.com/marcelosilva78/CryptoVaultHub', 'support@cryptovaulthub.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header', description: 'Client API key with the required granular scope(s) for the endpoint. See the per-operation summary for the exact scope needed.' }, 'ApiKey')
    .addCookieAuth('cvh_session', { type: 'apiKey', in: 'cookie', name: 'cvh_session', description: 'Portal session cookie. Required for self-service API key management endpoints (/client/v1/api-keys). Cannot be combined with X-API-Key.' }, 'PortalSession')
    .addTag('Wallets', 'Query wallet information and balances across supported chains')
    .addTag('Deposits', 'Generate deposit addresses and track incoming deposits')
    .addTag('Withdrawals', 'Create withdrawal requests and track outgoing transactions')
    .addTag('Webhooks', 'Configure webhook endpoints for real-time event notifications')
    .addTag('Address Book', 'Manage whitelisted withdrawal destination addresses')
    .addTag('Co-Sign', 'Co-signature operations for co-sign custody mode clients')
    .addTag('Flush', 'Sweep forwarder balances back to the hot wallet')
    .addTag('Address Groups', 'Manage logical groupings of deposit addresses')
    .addTag('Exports', 'Request and download data exports (CSV, XLSX, JSON)')
    .addTag('Project Setup', 'Create projects, initialize keys, check gas, and deploy contracts')
    .addTag('Deploy Traces', 'Query on-chain deployment audit trail for contracts')
    .addTag('Tokens', 'Query available tokens across supported chains')
    .addTag('API Keys', 'Self-service API key management (JWT-only, requires portal session)')
    .addTag('Health', 'Service health endpoint')
    .addServer('http://localhost:3002', 'Development')
    .addServer('https://api.vaulthub.live', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('client/api/docs', app, document, {
    customSiteTitle: 'CryptoVaultHub Client API Documentation',
    customCss: `
      .swagger-ui .topbar { background-color: #0D0F14; }
      .swagger-ui .info .title { color: #E2A828; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      syntaxHighlight: { theme: 'monokai' },
      tagsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3002;
  await app.listen(port);
  logger.log(`Client API running on port ${port}`);
  logger.log(`API docs available at /client/api/docs`);
}
bootstrap();
