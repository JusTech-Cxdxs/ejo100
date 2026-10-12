/**
 * Direct database access for the tests — ONLY for:
 *  • fixtures a spec needs that are not the thing being tested (a fresh
 *    vehicle with a never-used plate, so specs never collide and a retry
 *    always starts clean), and
 *  • cheap downstream checks the UI does not show (e.g. exactly one payment
 *    row after a double submit).
 * Never used to move a workflow along — every business step goes through
 * the browser, as the right person. CI only (throwaway test database).
 */
import { PrismaClient } from '@prisma/client';
import { CUSTOMER } from './people';

let client: PrismaClient | null = null;
export function db(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

/** A brand-new passenger vehicle for `customerEmail` (default: Ada Customer), with a unique plate. */
export async function freshVehicle(tag: string, opts: { customerEmail?: string; make?: string; model?: string; year?: number } = {}): Promise<{ id: string; plate: string; label: string }> {
  const prisma = db();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: opts.customerEmail ?? CUSTOMER.email } });
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const plate = `${tag.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X')}-${stamp}`;
  const v = await prisma.customerVehicle.create({
    data: { customerId: customer.id, make: opts.make ?? 'Toyota', model: opts.model ?? 'Camry', year: opts.year ?? 2018, vehicleType: 'PASSENGER', plateNumber: plate, mileage: 50000 },
  });
  return { id: v.id, plate, label: `${opts.make ?? 'Toyota'} ${opts.model ?? 'Camry'}` };
}

export async function idOfPart(partNumber: string): Promise<string> {
  const p = await db().part.findFirstOrThrow({ where: { partNumber }, select: { id: true } });
  return p.id;
}

export async function jobCardIdFromUrl(url: string): Promise<string> {
  const id = /\/workshop\/job-cards\/([^/?#]+)/.exec(url)?.[1];
  if (!id) throw new Error(`Not a Job Card URL: ${url}`);
  return id;
}

export async function paymentsOn(jobCardId: string): Promise<number> {
  return db().payment.count({ where: { jobCardId } });
}

/** Where the data-change journal's rows went: by organisation stamp, actor and transaction — for a clear failure message. */
export async function journalDiagnosis(userEmail: string): Promise<string> {
  const prisma = db();
  const me = await prisma.user.findUniqueOrThrow({ where: { email: userEmail }, select: { organisationId: true } });
  const rows = await prisma.auditLog.findMany({
    where: { entityType: { startsWith: 'db:' } },
    select: { organisationId: true, userId: true, metadata: true },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });
  const tally = new Map<string, number>();
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const key = `org=${r.organisationId === null ? 'NULL' : r.organisationId === me.organisationId ? 'mine' : 'other'} user=${r.userId ? 'set' : 'NULL'} tx=${meta.inTransaction ? 'yes' : 'no'} source=${String(meta.source ?? '?')}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const orgs = await prisma.organisation.count();
  return `${rows.length} data-change rows (latest 2000), ${orgs} organisations: ${[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join('; ') || 'none'}`;
}

/** Fixture: put a portal customer's password back to a known value and their access on (so a retry starts clean). */
export async function resetCustomerAccount(email: string, password: string): Promise<void> {
  const { hashPassword } = await import('better-auth/crypto');
  const prisma = db();
  const c = await prisma.customer.update({ where: { email }, data: { isActive: true }, select: { id: true } });
  await prisma.customerAccount.updateMany({ where: { customerId: c.id, providerId: 'credential' }, data: { password: await hashPassword(password) } });
}
