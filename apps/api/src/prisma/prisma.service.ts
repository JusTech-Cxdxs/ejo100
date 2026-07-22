import { Injectable } from '@nestjs/common';
import { prisma } from '@ejo/database';

/**
 * Thin Nest-DI wrapper around the shared @ejo/database Prisma client, so
 * services inject PrismaService the idiomatic Nest way instead of each
 * importing the singleton directly. There is still only one PrismaClient
 * instance process-wide (see packages/database/src/index.ts).
 */
@Injectable()
export class PrismaService {
  readonly client = prisma;
}
