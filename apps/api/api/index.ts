import 'reflect-metadata';
import express from 'express';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppModule } from '../src/app.module';

/**
 * Vercel serverless entrypoint for the NestJS API.
 *
 * Vercel runs functions as stateless request handlers, not long-lived
 * servers — src/main.ts's `app.listen(port)` (used for local dev via
 * `npm run start:dev`) never runs here. This file wraps the same
 * AppModule in an Express adapter and caches the initialized app across
 * warm invocations, which is the standard pattern for deploying NestJS
 * on Vercel. Local development is unaffected — main.ts is untouched.
 */
let cachedApp: express.Express | undefined;

async function bootstrapServer(): Promise<express.Express> {
  if (!cachedApp) {
    const expressApp = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

    app.enableCors({
      origin: [process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001'],
      credentials: true,
    });
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');

    await app.init();
    cachedApp = expressApp;
  }
  return cachedApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const server = await bootstrapServer();
  server(req, res);
}
