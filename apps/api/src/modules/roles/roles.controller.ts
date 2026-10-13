import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { PlatformTeamGuard } from '../../common/guards/platform-team.guard';
import { RolesService } from './roles.service';

/**
 * Read-only. Platform team only (PlatformTeamGuard); requires a Better Auth
 * session, whose table is shared with the portal.
 */
@UseGuards(SessionAuthGuard, PlatformTeamGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }
}
