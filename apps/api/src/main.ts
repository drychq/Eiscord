import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const webOrigin = config.get<string | undefined>('PUBLIC_WEB_ORIGIN');

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: webOrigin ?? true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );

  await app.listen(port);
}

void bootstrap();
