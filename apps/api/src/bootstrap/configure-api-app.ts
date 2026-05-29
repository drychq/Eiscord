import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function createApiValidationPipe() {
  return new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });
}

export function configureApiApp(app: INestApplication, config: ConfigService) {
  const webOrigin = config.get<string | undefined>('PUBLIC_WEB_ORIGIN');

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: webOrigin ?? true,
  });
  app.useGlobalPipes(createApiValidationPipe());
}
