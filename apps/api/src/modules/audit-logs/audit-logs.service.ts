import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditLogQuery = {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

/**
 * Read side of the audit trail, ready for the future audit dashboard.
 * The trail itself is append-only: nothing in the platform updates or
 * deletes an audit entry.
 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(raw: AuditLogQuery = {}) {
    // Query values arrive as strings, but a repeated parameter (?userId=a&userId=b)
    // arrives as an array; keep only plain, short strings so Prisma never sees one.
    const str = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : undefined);
    const query = {
      entityType: str(raw.entityType),
      entityId: str(raw.entityId),
      userId: str(raw.userId),
      action: str(raw.action),
      from: str(raw.from),
      to: str(raw.to),
      cursor: str(raw.cursor),
      limit: raw.limit,
    };
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const createdAt: { gte?: Date; lte?: Date } = {};
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) createdAt.lte = to;
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }
}
