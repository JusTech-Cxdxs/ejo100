import { Public } from '../../common/decorators/public.decorator';
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
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch (error) {
      // The reason stays in the server log; callers (unauthenticated) only
      // learn that the database is unreachable — never its host or error (SEC-09).
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ level: 'error', at: 'health', error: error instanceof Error ? error.name : 'unknown' }));
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
