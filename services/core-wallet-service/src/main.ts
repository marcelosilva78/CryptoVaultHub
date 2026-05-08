import { initTracing } from '@cvh/config';
initTracing('core-wallet-service');

// Make Prisma's BigInt fields JSON-serializable. Without this, any controller
// returning a Prisma row with a BigInt column (id, clientId, projectId, etc.)
// crashes with "Do not know how to serialize a BigInt" inside express's JSON.stringify.
// Numbers up to 2^53 are safe; for larger we coerce to string.
(BigInt.prototype as any).toJSON = function (): number | string {
  const asNumber = Number(this);
  return Number.isSafeInteger(asNumber) ? asNumber : this.toString();
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('CoreWalletService');
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

  const port = process.env.PORT || 3004;
  await app.listen(port);
  logger.log(`Core Wallet Service running on port ${port}`);
}
bootstrap();
