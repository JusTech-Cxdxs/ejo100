import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * Document and case-file management.
 * Phase 1: module + controller + service scaffolding only, registered in
 * AppModule so the route exists. Business logic and Prisma-backed queries
 * are added when this module's phase is reached (see docs/architecture.md).
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
