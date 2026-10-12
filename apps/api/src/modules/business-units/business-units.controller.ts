import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { PlatformTeamGuard } from '../../common/guards/platform-team.guard';
import { BusinessUnitsService } from './business-units.service';

/**
 * Read-only. Platform team only (PlatformTeamGuard); requires a Better Auth
 * session, whose table is shared with the portal.
 */
@UseGuards(SessionAuthGuard, PlatformTeamGuard)
@Controller('business-units')
export class BusinessUnitsController {
  constructor(private readonly businessunitsService: BusinessUnitsService) {}

  @Get()
  findAll() {
    return this.businessunitsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businessunitsService.findOne(id);
  }
}
