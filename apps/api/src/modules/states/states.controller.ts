import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { StatesService } from './states.service';

/**
 * Read-only. Requires a Better Auth session (SessionAuthGuard), whose table
 * is shared with the portal.
 */
@UseGuards(SessionAuthGuard)
@Controller('states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Get()
  findAll() {
    return this.statesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.statesService.findOne(id);
  }
}
