import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unauthenticated health endpoint — GET /api/v1/health. Deliberately
 * checks real database connectivity (a trivial `SELECT 1`), not just
 * "the Node process is running": a Render deploy can report the app as
 * "live" while Prisma/Supabase is actually unreachable (wrong
 * DATABASE_URL, Supabase paused/rate-limited, etc.) — this endpoint is
 * what would actually catch that, either for Render's own Health Check
 * Path setting or for manual verification after a deploy.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown database error',
      });
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
