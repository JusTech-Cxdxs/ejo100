import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * EJO 100 API entrypoint. Phase 1: bootstraps the app with every domain
 * module registered (see app.module.ts) but no business logic or
 * database-backed endpoints yet — those land module-by-module in later
 * phases per the project's incremental build rule.
 */

// Browsers never send an Origin header with a trailing slash — if the
// configured env var has one (e.g. "https://portal.example.com/"), a
// strict-equality CORS allow-list check against it would never match a
// real request's Origin, silently rejecting every cross-origin call.
// Stripping it here means the env var can be set either way without
// breaking CORS.
function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Without this, Nest never listens for SIGTERM/SIGINT, so
  // onModuleDestroy hooks (e.g. PrismaService's clean $disconnect())
  // never run — a Render rolling deploy would kill the process mid-query
  // instead of letting it shut down cleanly.
  app.enableShutdownHooks();

  const portalOrigin = stripTrailingSlash(process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001');
  app.enableCors({
    origin: [portalOrigin],
    credentials: true, // required so an explicitly-attached session token is accepted cross-origin
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`EJO 100 API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
