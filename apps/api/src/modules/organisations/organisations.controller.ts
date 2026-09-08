import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { OrganisationsService } from './organisations.service';

/**
 * Read-only for Phase 2 (hierarchy is seeded/managed via prisma/seed.ts
 * and, later, an admin UI) — create/update/delete endpoints arrive with
 * the Organisation/Hierarchy admin screens in a later phase. Every route
 * requires a valid Better Auth session (SessionAuthGuard), shared with
 * the portal via the same database.
 */
@UseGuards(SessionAuthGuard)
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly organisationsService: OrganisationsService) {}

  @Get()
  findAll() {
    return this.organisationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organisationsService.findOne(id);
  }
}
