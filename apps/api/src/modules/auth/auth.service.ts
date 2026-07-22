import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The API does not implement its own login/signup — Better Auth in
 * apps/portal owns that (see apps/portal/lib/auth.ts), writing into the
 * shared users/sessions/accounts tables. This service only reads that
 * same data back, for endpoints that need to know who the caller is.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserBySessionToken(token: string) {
    const session = await this.prisma.client.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      return null;
    }
    return session.user;
  }
}
