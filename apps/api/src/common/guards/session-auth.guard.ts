import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Validates a Better Auth session token against the shared `sessions`
 * table (see packages/database schema + apps/portal/lib/auth.ts — both
 * write into the same Postgres database, which is what lets the API
 * trust a session created by the portal's login flow).
 *
 * Token is read from the `Authorization: Bearer <token>` header (for
 * server-to-server / mobile clients) or the `better-auth.session_token`
 * cookie Better Auth sets in the browser. Expired or unknown tokens are
 * rejected; this guard does NOT distinguish roles/permissions — combine
 * with a RolesGuard (see roles.guard.ts, hierarchy phase) for that.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing session token');
    }

    const session = await this.prisma.client.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Attach the authenticated user to the request for downstream handlers.
    (request as Request & { user?: typeof session.user }).user = session.user;
    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    const cookieToken = request.cookies?.['better-auth.session_token'];
    return typeof cookieToken === 'string' ? cookieToken : null;
  }
}
