import type { NextFunction, Request, Response } from 'express';

/**
 * Security headers on every API response (no extra library needed).
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  next();
}

type Window = { count: number; start: number };
const WINDOW_MS = 60_000;
const hits = new Map<string, Window>();
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [k, w] of hits) if (w.start < cutoff) hits.delete(k);
}, WINDOW_MS).unref();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limiting per client address (fixed one-minute window, in memory per
 * instance): 300 requests a minute in general, 20 a minute on auth routes.
 * Over the limit → 429 with Retry-After. (A WAF / shared store adds a
 * global limit in front later — see the platform blueprint.)
 */
export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const isAuth = req.path.includes('/auth');
  const limit = isAuth ? 20 : 300;
  const key = `${isAuth ? 'a' : 'g'}:${clientIp(req)}`;
  const now = Date.now();
  const w = hits.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    hits.set(key, { count: 1, start: now });
    return next();
  }
  w.count += 1;
  if (w.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil((w.start + WINDOW_MS - now) / 1000)));
    res.status(429).json({ statusCode: 429, message: 'Too many requests — please slow down.' });
    return;
  }
  next();
}
