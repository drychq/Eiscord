import { Controller, Get, HttpStatus, Post } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { Public } from '../../common/auth/public.decorator';
import { AppError } from '../../common/errors/app-error';
import { MediasoupWorkerClient } from '../media-signaling/mediasoup-worker.client';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly mediasoupWorkerClient: MediasoupWorkerClient,
  ) {}

  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }

  @Get('_test/media-worker-pid')
  getMediaWorkerPid() {
    this.assertTestMode();
    return { pid: this.mediasoupWorkerClient.getPid() };
  }

  @Post('_test/kill-media-worker')
  killMediaWorker() {
    this.assertTestMode();
    const killed = this.mediasoupWorkerClient.killWorker('SIGKILL');
    return { killed };
  }

  private assertTestMode() {
    if (process.env.NODE_ENV !== 'test') {
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Test-only endpoint is disabled outside NODE_ENV=test.',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
