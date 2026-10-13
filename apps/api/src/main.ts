import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { securityHeaders, rateLimit } from './common/middleware/security';

/**
 * EJO 100 API entry point. Modules are registered in app.module.ts.
 */

// Browsers never send an Origin with a trailing slash, so strip one from the
// configured URL; otherwise the CORS allow-list would never match.
function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Lets onModuleDestroy hooks (PrismaService's $disconnect) run on
  // SIGTERM/SIGINT, so a rolling deploy doesn't cut queries off mid-way.
  app.enableShutdownHooks();

  // The only browser origin allowed to call the API. Required in production:
  // the API refuses to start rather than fall back to a default address.
  const configuredOrigin = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (!configuredOrigin && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_PORTAL_URL is not set. Set it in Render → Environment, then redeploy.');
  }
  const portalOrigin = stripTrailingSlash(configuredOrigin || 'http://localhost:3001');
  app.enableCors({
    origin: [portalOrigin],
    credentials: true, // required so an explicitly-attached session token is accepted cross-origin
  });
  // Security headers and per-client rate limiting on every request.
  app.use(securityHeaders);
  app.use(rateLimit);
  (app.getHttpAdapter().getInstance() as { disable?: (s: string) => void }).disable?.('x-powered-by');
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`EJO 100 API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
