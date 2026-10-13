import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { PlatformTeamGuard } from '../../common/guards/platform-team.guard';
import { DepartmentsService } from './departments.service';

/**
 * Read-only. Platform team only (PlatformTeamGuard); requires a Better Auth
 * session, whose table is shared with the portal.
 */
@UseGuards(SessionAuthGuard, PlatformTeamGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }
}
