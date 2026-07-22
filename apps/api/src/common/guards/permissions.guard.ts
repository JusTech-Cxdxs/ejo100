import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '@ejo/database';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Runs AFTER SessionAuthGuard (which attaches request.user). Reads the
 * permission key set by @RequirePermission(...) on the route handler and
 * checks it against the authenticated user's roles via the
 * UserRole -> Role -> RolePermission -> Permission chain (see
 * packages/database schema). No key on the route = no check, request
 * passes through.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<string | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: User }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('No authenticated user on request');
    }

    const match = await this.prisma.client.userRole.findFirst({
      where: {
        userId: user.id,
        role: {
          permissions: {
            some: { permission: { key: requiredPermission } },
          },
        },
      },
    });

    if (!match) {
      throw new ForbiddenException(`Missing permission: ${requiredPermission}`);
    }

    return true;
  }
}
