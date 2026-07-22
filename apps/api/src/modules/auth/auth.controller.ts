import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import type { User } from '@ejo/database';

@Controller('auth')
export class AuthController {
  /**
   * Returns the currently authenticated user, as resolved by
   * SessionAuthGuard from the shared Better Auth session table. Useful
   * for any client (mobile, another service) that isn't the portal
   * itself and needs to confirm who a token belongs to.
   */
  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@Req() request: Request & { user: User }) {
    return request.user;
  }
}
