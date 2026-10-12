import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { Request } from 'express';
import { setAuditActor } from '@ejo/database';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Validates a Better Auth session token against the `sessions` table the
 * portal writes, which is how the API trusts a portal sign-in.
 *
 * The token comes from `Authorization: Bearer <token>` (server-to-server or
 * mobile clients) or the Better Auth session cookie. Expired or unknown
 * tokens are refused. Permissions are checked separately (PermissionsGuard).
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Secure by default (registered globally): only @Public() routes skip it.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<Request>();
    // Already checked earlier in this request (route-level guard as well).
    if ((request as Request & { user?: unknown }).user) return true;
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
    // A switched-off account is refused here too (same rule as the portal).
    if (!session.user.isActive) {
      throw new UnauthorizedException('This account is not active');
    }

    // Attach the authenticated user to the request for downstream handlers.
    (request as Request & { user?: typeof session.user }).user = session.user;
    // Attribute every database write in this request to this user.
    setAuditActor(session.user.id, 'api', (session.user as { organisationId?: string | null }).organisationId ?? null);
    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    // Over HTTPS Better Auth names the cookie with the __Secure- prefix. Its
    // value is "<token>.<signature>"; the token alone is the lookup key.
    const cookieToken = request.cookies?.['__Secure-better-auth.session_token'] ?? request.cookies?.['better-auth.session_token'];
    if (typeof cookieToken !== 'string' || !cookieToken) return null;
    return cookieToken.split('.')[0] || null;
  }
}
