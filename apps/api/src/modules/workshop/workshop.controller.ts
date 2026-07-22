import { Controller, Get } from '@nestjs/common';
import { WorkshopService } from './workshop.service';

@Controller('workshop')
export class WorkshopController {
  constructor(private readonly workshopService: WorkshopService) {}

  @Get()
  findAll() {
    return this.workshopService.findAll();
  }
}
