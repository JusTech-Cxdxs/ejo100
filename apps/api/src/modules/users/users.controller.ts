import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { PlatformTeamGuard } from '../../common/guards/platform-team.guard';
import { UsersService } from './users.service';

/**
 * Read-only. Platform team only (PlatformTeamGuard); requires a Better Auth
 * session, whose table is shared with the portal.
 */
@UseGuards(SessionAuthGuard, PlatformTeamGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
