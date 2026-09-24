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

  async findAll(query: AuditLogQuery = {}) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = new Date(query.to);
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...(query.from || query.to ? { createdAt } : {}),
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
