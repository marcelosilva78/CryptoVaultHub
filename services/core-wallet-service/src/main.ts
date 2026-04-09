import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3004;
  await app.listen(port);
  console.log(`@cvh/core-wallet-service running on port ${port}`);
}
bootstrap();
