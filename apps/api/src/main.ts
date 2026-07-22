import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * EJO 100 API entrypoint. Phase 1: bootstraps the app with every domain
 * module registered (see app.module.ts) but no business logic or
 * database-backed endpoints yet — those land module-by-module in later
 * phases per the project's incremental build rule.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'],
    credentials: true, // required so the shared Better Auth session cookie is sent
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`EJO 100 API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
