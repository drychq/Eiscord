import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type Redis as RedisClient } from 'ioredis';

import type { Environment } from '../config/env.validation';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient | null = null;

  constructor(private readonly configService: ConfigService<Environment, true>) {}

  async onModuleInit() {
    if (
      process.env.REDIS_SKIP_CONNECT === 'true' ||
      (process.env.NODE_ENV === 'test' && process.env.REDIS_CONNECT_IN_TEST !== 'true')
    ) {
      return;
    }

    const redisUrl = this.configService.get('REDIS_URL', { infer: true });
    const client = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    client.on('error', (error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });

    try {
      await client.connect();
      this.client = client;
      this.logger.log('Redis connection established.');
    } catch (error) {
      this.logger.warn(`Redis unavailable: ${error instanceof Error ? error.message : String(error)}`);
      client.disconnect();
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
      this.client = null;
    }
  }

  setClientForTesting(client: RedisClient | null) {
    this.client = client;
  }

  async execute<T>(operation: (client: RedisClient) => Promise<T>): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    try {
      return await operation(this.client);
    } catch (error) {
      this.logger.warn(`Redis operation failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
