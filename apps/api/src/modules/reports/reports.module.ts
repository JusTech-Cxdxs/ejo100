import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Cross-module reporting and exports.
 * Phase 1: module + controller + service scaffolding only, registered in
 * AppModule so the route exists. Business logic and Prisma-backed queries
 * are added when this module's phase is reached (see docs/architecture.md).
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
