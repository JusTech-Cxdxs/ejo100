import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { PlatformTeamGuard } from '../../common/guards/platform-team.guard';
import { TeamsService } from './teams.service';

/**
 * Read-only. Platform team only (PlatformTeamGuard); requires a Better Auth
 * session, whose table is shared with the portal.
 */
@UseGuards(SessionAuthGuard, PlatformTeamGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }
}
