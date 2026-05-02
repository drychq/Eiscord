import { Injectable } from '@nestjs/common';

import { healthResponseSchema, type HealthResponse } from '@eiscord/shared';

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    });
  }
}
