import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

/**
 * File storage via Supabase Storage (Cloudflare R2 later).
 * Placeholder: registered so the route exists; no business logic yet.
 */
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
