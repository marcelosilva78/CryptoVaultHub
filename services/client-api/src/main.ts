import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('ClientApi');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

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
All endpoints require API key authentication via the \`X-API-Key\` header. API keys are created through the Auth Service or the Client Portal.

### API Key Scopes
- **read**: Query wallets, deposits, withdrawals, addresses, webhooks
- **write**: Create deposit addresses, webhooks, whitelist addresses, test webhooks
- **withdraw**: Create withdrawal requests (requires explicit scope)

### Example Request
\`\`\`bash
curl -X GET https://api.cryptovaulthub.com/client/v1/wallets \\
  -H "X-API-Key: cvh_sk_live_abc123def456..."
\`\`\`

## Rate Limiting
- 100 requests/second per API key (enforced by Kong API Gateway)
- Batch endpoints count as N requests where N is the batch size
- Rate limits are configurable per client tier

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
- \`withdrawal.submitted\` — Withdrawal transaction broadcasted
- \`withdrawal.confirmed\` — Withdrawal confirmed on-chain
- \`withdrawal.failed\` — Withdrawal failed
- \`forwarder.deployed\` — New forwarder contract deployed

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
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header', description: 'API key with appropriate scopes (read/write/withdraw)' }, 'ApiKey')
    .addTag('Wallets', 'Query wallet information and balances across supported chains')
    .addTag('Deposits', 'Generate deposit addresses and track incoming deposits')
    .addTag('Withdrawals', 'Create withdrawal requests and track outgoing transactions')
    .addTag('Webhooks', 'Configure webhook endpoints for real-time event notifications')
    .addTag('Address Book', 'Manage whitelisted withdrawal destination addresses')
    .addTag('Co-Sign', 'Co-signature operations for co-sign custody mode clients')
    .addTag('Health', 'Service health and token metadata endpoints')
    .addServer('http://localhost:3002', 'Development')
    .addServer('https://api.cryptovaulthub.com', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
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
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
