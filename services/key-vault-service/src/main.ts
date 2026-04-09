import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('KeyVaultService');
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

  // No CORS — this service runs in isolated Docker network
  // Only Core Wallet Service can reach it via mTLS
  const port = process.env.PORT || 3005;
  await app.listen(port);
  logger.log(`Key Vault Service running on port ${port} (isolated network)`);
}
bootstrap();
