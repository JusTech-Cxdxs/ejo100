import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * File storage via Supabase Storage (Cloudflare R2 later).
 * Phase 1: module + controller + service scaffolding only, registered in
 * AppModule so the route exists. Business logic and Prisma-backed queries
 * are added when this module's phase is reached (see docs/architecture.md).
 */
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
