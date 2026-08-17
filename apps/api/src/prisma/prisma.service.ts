import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma } from '@ejo/database';

/**
 * Thin Nest-DI wrapper around the shared @ejo/database Prisma client, so
 * services inject PrismaService the idiomatic Nest way instead of each
 * importing the singleton directly. There is still only one PrismaClient
 * instance process-wide (see packages/database/src/index.ts).
 *
 * Explicit lifecycle hooks (added for production on Render — a persistent
 * process, not serverless):
 * - onModuleInit connects eagerly at boot instead of relying on Prisma's
 *   default lazy-connect-on-first-query behaviour. Without this, a bad
 *   DATABASE_URL/DIRECT_URL doesn't surface until the first real request
 *   hits the database — the process reports "successfully started" either
 *   way. Connecting here means a misconfigured database fails the Render
 *   deploy immediately and visibly, not silently at some later request.
 * - onModuleDestroy disconnects cleanly on shutdown, so a Render rolling
 *   deploy's SIGTERM lets in-flight queries finish/close properly instead
 *   of the connection being torn down mid-request.
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
