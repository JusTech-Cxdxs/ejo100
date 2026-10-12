import { Module } from '@nestjs/common';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

/**
 * Warehouse, shelf and bin locations.
 * Placeholder: registered so the route exists; no business logic yet.
 */
@Module({
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
