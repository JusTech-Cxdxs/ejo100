import { Module } from '@nestjs/common';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

/**
 * Warehouse, shelf and bin locations.
 * Phase 1: module + controller + service scaffolding only, registered in
 * AppModule so the route exists. Business logic and Prisma-backed queries
 * are added when this module's phase is reached (see docs/architecture.md).
 */
@Module({
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
