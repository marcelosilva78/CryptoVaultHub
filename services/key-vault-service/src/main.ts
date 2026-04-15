import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('KeyVaultService');

  const tlsEnabled = process.env.VAULT_TLS_ENABLED === 'true';
  let appOptions: Record<string, unknown> = {
    logger: ['error', 'warn', 'log'],
  };

  if (tlsEnabled) {
    const certPath = process.env.VAULT_TLS_CERT_PATH;
    const keyPath = process.env.VAULT_TLS_KEY_PATH;
    const caPath = process.env.VAULT_TLS_CA_PATH;

    if (!certPath || !keyPath || !caPath) {
      throw new Error(
        'VAULT_TLS_ENABLED=true but missing required env vars: ' +
          'VAULT_TLS_CERT_PATH, VAULT_TLS_KEY_PATH, VAULT_TLS_CA_PATH',
      );
    }

    logger.log('mTLS enabled — loading certificates...');
    logger.log(`  Server cert: ${certPath}`);
    logger.log(`  Server key:  ${keyPath}`);
    logger.log(`  CA cert:     ${caPath}`);

    appOptions = {
      ...appOptions,
      httpsOptions: {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        ca: fs.readFileSync(caPath),
        requestCert: true,
        rejectUnauthorized: true,
      },
    };

    logger.log('mTLS certificates loaded — requiring client certificates');
  } else {
    logger.warn(
      'VAULT_TLS_ENABLED is not set — running plain HTTP (development mode)',
    );
  }

  const app = await NestFactory.create(AppModule, appOptions);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // No CORS — this service runs in isolated Docker network
  // Only Core Wallet Service can reach it via mTLS
  const port = process.env.PORT || 3005;
  await app.listen(port);
  logger.log(
    `Key Vault Service running on port ${port} (${tlsEnabled ? 'HTTPS/mTLS' : 'HTTP'}, isolated network)`,
  );
}
bootstrap();
