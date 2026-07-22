import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Inventory and stock management.
 * Phase 1: module + controller + service scaffolding only, registered in
 * AppModule so the route exists. Business logic and Prisma-backed queries
 * are added when this module's phase is reached (see docs/architecture.md).
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
