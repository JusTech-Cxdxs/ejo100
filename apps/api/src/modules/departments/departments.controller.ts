import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { DepartmentsService } from './departments.service';

/**
 * Read-only for Phase 2 (hierarchy is seeded/managed via prisma/seed.ts
 * and, later, an admin UI) — create/update/delete endpoints arrive with
 * the Company/Hierarchy admin screens in a later phase. Every route
 * requires a valid Better Auth session (SessionAuthGuard), shared with
 * the portal via the same database.
 */
@UseGuards(SessionAuthGuard)
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
