import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('AdminApi');
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
    .setTitle('CryptoVaultHub Admin API')
    .setDescription(`
## Overview
The CryptoVaultHub Admin API provides endpoints for platform administrators to manage clients, blockchain chains, tokens, tiers, compliance alerts, and system monitoring.

## Authentication
All endpoints require JWT authentication via the \`Authorization: Bearer <token>\` header. Tokens are obtained from the Auth Service (\`/auth/login\`).

### Roles
- **super_admin**: Full access to all endpoints
- **admin**: Can manage clients, chains, tokens, tiers, and compliance
- **viewer**: Read-only access to list/get endpoints

## Rate Limiting
- 50 requests/second per IP (enforced by Kong API Gateway)
- Individual endpoint limits may apply based on client tier

## Response Format
All responses follow the standard envelope:
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
\`\`\`

## Error Format
\`\`\`json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
\`\`\`
    `)
    .setVersion('1.0.0')
    .setContact('CryptoVaultHub', 'https://github.com/marcelosilva78/CryptoVaultHub', 'admin@cryptovaulthub.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT token obtained from /auth/login' },
      'JWT',
    )
    .addTag('Clients', 'Manage client organizations — create, update, list clients and their custody configurations')
    .addTag('Chains', 'Configure supported EVM blockchain networks with RPC endpoints')
    .addTag('Tokens', 'Manage ERC-20 token registry across supported chains')
    .addTag('Tiers', 'Configure rate limits, resource quotas, and compliance levels')
    .addTag('Compliance', 'KYT/AML alert management and sanctions screening')
    .addTag('Monitoring', 'System health, queue status, and gas tank monitoring')
    .addServer('http://localhost:3001', 'Development')
    .addServer('https://api.cryptovaulthub.com', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'CryptoVaultHub Admin API Documentation',
    customCss: `
      .swagger-ui .topbar { background-color: #0D0F14; }
      .swagger-ui .topbar .link { content: url(''); }
      .swagger-ui .info .title { color: #E2A828; }
      .swagger-ui .scheme-container { background-color: #111318; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      syntaxHighlight: { theme: 'monokai' },
    },
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Admin API running on port ${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
