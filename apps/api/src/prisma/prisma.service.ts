import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma } from '@ejo/database';

/**
 * Nest wrapper around the shared @ejo/database client, so services can
 * inject PrismaService. There is still one PrismaClient per process
 * (packages/database/src/index.ts).
 *
 * - onModuleInit connects at boot, so a bad DATABASE_URL/DIRECT_URL fails
 *   the deploy instead of the first request.
 * - onModuleDestroy disconnects on shutdown, so a rolling deploy's SIGTERM
 *   lets in-flight queries finish.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Database connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log('Database connection closed.');
  }
}
