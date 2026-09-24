import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /password|token|secret|hash/i;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 5) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

/**
 * Global API audit interceptor — every state-changing request (POST,
 * PUT, PATCH, DELETE) is written to audit_logs: who (the session user),
 * what (method, route, record id, redacted request body), when, from
 * where (IP), how long it took, and whether it succeeded. Failed
 * attempts are recorded too — a denied or broken change is exactly what
 * an auditor needs to see.
 *
 * This is the request-level layer. Beneath it, the data journal in
 * @ejo/database records the exact rows changed (before/after) for every
 * write from any source, so the two together leave nothing unrecorded.
 * A logging failure never affects the request itself.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    if (!MUTATING_METHODS.has(request.method)) return next.handle();

    const startedAt = Date.now();
    const route = (request.route as { path?: string } | undefined)?.path ?? request.path;
    const base = {
      method: request.method,
      path: request.originalUrl,
      route,
      params: request.params,
      body: redact(request.body),
    };
    const write = (outcome: 'succeeded' | 'failed', extra: Record<string, unknown>) => {
      this.prisma.client.auditLog
        .create({
          data: {
            userId: request.user?.id ?? null,
            action: `api.${request.method.toLowerCase()}${outcome === 'failed' ? '.failed' : ''}`,
            entityType: `api:${route}`,
            entityId: typeof request.params?.id === 'string' ? request.params.id : null,
            ipAddress: (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? request.ip ?? null,
            metadata: JSON.parse(JSON.stringify({ ...base, ...extra, durationMs: Date.now() - startedAt })),
          },
        })
        .catch((err: unknown) => this.logger.error('Failed to write API audit entry', err as Error));
    };

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        write('succeeded', { status: response.statusCode });
      }),
      catchError((err: unknown) => {
        const status = (err as { status?: number; getStatus?: () => number }).getStatus?.() ?? (err as { status?: number }).status ?? 500;
        write('failed', { status, error: (err as Error)?.message ?? String(err) });
        return throwError(() => err);
      }),
    );
  }
}
