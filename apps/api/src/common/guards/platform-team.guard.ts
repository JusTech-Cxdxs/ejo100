import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@ejo/database';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Runs after SessionAuthGuard. Organisation data served by this API
 * (people, roles, branches, departments, teams, organisations, the audit
 * trail) is not yet filtered per organisation, so it is open to the
 * PLATFORM TEAM only (holders of the Master Administrator role). The
 * portal does not use these routes — organisations reach their own data
 * through the portal, where every query is fenced to their organisation.
 */
@Injectable()
export class PlatformTeamGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<Request & { user?: User }>().user;
    if (!user) throw new ForbiddenException('No authenticated user on request');
    const platform = await this.prisma.client.userRole.findFirst({ where: { userId: user.id, role: { isSuperAdmin: true } }, select: { id: true } });
    if (!platform) throw new ForbiddenException('This endpoint is for the platform team.');
    return true;
  }
}
