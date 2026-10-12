import { Public } from '../../common/decorators/public.decorator';
import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unauthenticated health check, GET /api/v1/health. Runs `SELECT 1` so a
 * process that is up but cannot reach the database (wrong DATABASE_URL,
 * paused database) reports unhealthy. Used as the host's health check path.
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
