import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.PRISMA_SKIP_CONNECT === 'true') {
      return;
    }

    await this.$connect();
    this.logger.log('Prisma connection established.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
