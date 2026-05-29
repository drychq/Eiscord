import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IsString } from 'class-validator';
import request from 'supertest';

import { ErrorCode } from '@eiscord/shared';

import { AppModule } from '../../app.module';
import { Public } from '../auth/public.decorator';
import { configureApiApp } from '../../bootstrap/configure-api-app';

class ProbeDto {
  @IsString()
  name!: string;
}

@Public()
@Controller('probe')
class ProbeController {
  @Get('boom')
  boom() {
    throw new Error('boom');
  }

  @Post('validate')
  validate(@Body() body: ProbeDto) {
    return body;
  }
}

@Module({
  imports: [AppModule],
  controllers: [ProbeController],
})
class ProbeModule {}

describe('API envelopes', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  beforeAll(async () => {
    process.env.PRISMA_SKIP_CONNECT = 'true';
    app = await NestFactory.create(ProbeModule, { logger: false });
    configureApiApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PRISMA_SKIP_CONNECT;
  });

  it('wraps health responses and exposes x-request-id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.body).toMatchObject({
      data: {
        service: 'api',
        status: 'ok',
      },
      request_id: response.headers['x-request-id'],
    });
    expect(response.body.server_time).toEqual(expect.any(String));
  });

  it('reuses caller-provided request ids', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'request-from-test')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('request-from-test');
    expect(response.body.request_id).toBe('request-from-test');
  });

  it('maps unknown exceptions to unified errors', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/probe/boom').expect(500);

    expect(response.body).toMatchObject({
      error: {
        code: ErrorCode.InternalError,
        message: 'Internal server error',
      },
    });
  });

  it('maps validation errors to unified errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .send({ name: 42 })
      .expect(400);

    expect(response.body.error.code).toBe(ErrorCode.ValidationFailed);
    expect(response.body.error.details.validation_errors).toContain(
      'name must be a string',
    );
  });
});
