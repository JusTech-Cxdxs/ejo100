'use server';

import { prisma } from '@ejo/database';
import { authorize, getPrincipal, orgWhere } from '@/lib/authz/server';
import { ERROR_KINDS, isErrorKind, KIND_LABEL, KIND_TODO, normaliseRef, type ErrorKind } from '@/lib/error-events-core';

/**
 * The Error log (Audit Logs → Error log): look up the reference a person
 * quotes. Read-only. Same permission as the audit trail (audit.view), and
 * fenced like it: an organisation sees only its own errors; the platform
 * team sees all, including errors with no organisation (signed-out pages).
 */

export type ErrorLogRow = {
  id: string; ref: string; at: Date; app: 'portal' | 'website'; kind: ErrorKind; kindLabel: string; todo: string;
  message: string; name: string | null; method: string | null; path: string | null; route: string | null; stack: string | null;
  who: { label: string; href: string | null; type: 'staff' | 'customer' | 'none' };
};

const PAGE = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function getErrorLogPage(f: { ref?: string; app?: string; kind?: string; route?: string; from?: string; to?: string; cursor?: string }) {
  await authorize('audit.view', undefined, 'error-log');
  const ref = normaliseRef(f.ref);
  const app = f.app === 'portal' || f.app === 'website' ? f.app : undefined;
  const kind = isErrorKind(f.kind) ? f.kind : undefined;
  const route = f.route?.trim().slice(0, 100) || undefined;
  const createdAt: { gte?: Date; lt?: Date } = {};
  // Dates are Lagos days (UTC+1, no daylight saving).
  if (f.from && DAY.test(f.from)) createdAt.gte = new Date(`${f.from}T00:00:00+01:00`);
  if (f.to && DAY.test(f.to)) createdAt.lt = new Date(new Date(`${f.to}T00:00:00+01:00`).getTime() + 86_400_000);
  const rows = await prisma.errorEvent.findMany({
    where: {
      ...(await orgWhere()),
      ...(ref ? { ref } : {}),
      ...(app ? { app } : {}),
      ...(kind ? { kind } : {}),
      ...(route ? { OR: [{ route: { contains: route, mode: 'insensitive' as const } }, { path: { contains: route, mode: 'insensitive' as const } }] } : {}),
      ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    ...(f.cursor && /^[a-z0-9]{10,40}$/i.test(f.cursor) ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, PAGE);
  const userIds = [...new Set(page.map((r) => r.userId).filter((v): v is string => Boolean(v)))];
  const customerIds = [...new Set(page.map((r) => r.customerId).filter((v): v is string => Boolean(v)))];
  const viewer = await getPrincipal();
  const [users, customers] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true, roles: { select: { role: { select: { isSuperAdmin: true } } } } } }) : [],
    customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds }, ...(await orgWhere()) }, select: { id: true, fullName: true } }) : [],
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const out: ErrorLogRow[] = page.map((r) => {
    const k: ErrorKind = isErrorKind(r.kind) ? r.kind : 'unknown';
    let who: ErrorLogRow['who'] = { label: r.app === 'website' ? 'A visitor (not signed in)' : 'Not signed in', href: null, type: 'none' };
    if (r.userId) {
      const u = userById.get(r.userId);
      // The platform team is shown to organisations as "Platform support", as on the audit trail.
      if (u && !viewer.isSuperAdmin && u.roles.some((x) => x.role.isSuperAdmin)) who = { label: 'Platform support', href: null, type: 'staff' };
      else who = u ? { label: u.fullName, href: `/users?q=${encodeURIComponent(u.email)}`, type: 'staff' } : { label: 'Former user', href: null, type: 'staff' };
    } else if (r.customerId) {
      const c = customerById.get(r.customerId);
      who = c ? { label: c.fullName, href: `/crm/customers/${c.id}`, type: 'customer' } : { label: 'A customer', href: null, type: 'customer' };
    }
    return {
      id: r.id, ref: r.ref, at: r.createdAt, app: r.app === 'website' ? 'website' : 'portal', kind: k, kindLabel: KIND_LABEL[k], todo: KIND_TODO[k],
      message: r.message, name: r.name, method: r.method, path: r.path, route: r.route, stack: r.stack, who,
    };
  });
  return { rows: out, nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null, ref, kinds: ERROR_KINDS.map((x) => ({ key: x.key, label: x.label })) };
}
