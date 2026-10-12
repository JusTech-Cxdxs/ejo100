import { Module } from '@nestjs/common';
import { WorkshopController } from './workshop.controller';
import { WorkshopService } from './workshop.service';

/**
 * Workshop. The portal implements the workshop in its own server actions;
 * this API module is a placeholder: registered so the route exists, no
 * business logic yet.
 */
@Module({
  controllers: [WorkshopController],
  providers: [WorkshopService],
  exports: [WorkshopService],
})
export class WorkshopModule {}
