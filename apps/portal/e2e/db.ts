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
import { CUSTOMER, SECOND_BRANCH } from './people';

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
  const kinds = await prisma.auditLog.groupBy({ by: ['entityType', 'action'], where: { entityType: { startsWith: 'db:' } }, _count: { _all: true } });
  const business = await prisma.auditLog.count({ where: { NOT: [{ entityType: { startsWith: 'db:' } }, { entityType: { startsWith: 'api:' } }] } });
  const businessMine = await prisma.auditLog.count({ where: { organisationId: me.organisationId, NOT: [{ entityType: { startsWith: 'db:' } }, { entityType: { startsWith: 'api:' } }] } });
  const [jobCards, warranties, payments] = await Promise.all([prisma.jobCard.count(), prisma.warranty.count(), prisma.payment.count()]);
  return `${rows.length} data-change rows (latest 2000), ${orgs} organisations: ${[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join('; ') || 'none'}` +
    ` · journaled: ${kinds.map((k) => `${k.entityType} ${k.action}×${k._count._all}`).join(', ') || 'nothing'}` +
    ` · business events: ${business} (${businessMine} stamped with this organisation) · written meanwhile: ${jobCards} job cards, ${warranties} warranties, ${payments} payments`;
}

/** Fixture: put a portal customer's password back to a known value and their access on (so a retry starts clean). */
export async function resetCustomerAccount(email: string, password: string): Promise<void> {
  const { hashPassword } = await import('better-auth/crypto');
  const prisma = db();
  const c = await prisma.customer.update({ where: { email }, data: { isActive: true }, select: { id: true } });
  await prisma.customerAccount.updateMany({ where: { customerId: c.id, providerId: 'credential' }, data: { password: await hashPassword(password) } });
}

/** Enyo predictions: the part type the seeded past jobs (and the new one) use — its own, so no other spec's stock moves. */
export const PREDICT_PART = { type: 'E2E Predict Brake Pads', name: 'E2E Predict Brake Pad Set', number: 'E2ES-PRD', price: 12000, stock: 30 };

/**
 * Fixture for the Enyo prediction spec: finished Job Cards (checked out, estimate
 * Manager-approved) whose complaints all carry `tag`, so they are the closest
 * matches for a new complaint with the same tag. `main` are in the first
 * branch, `other` in the second branch (outside a branch-scoped person's
 * reach). Every job had the Store part and brake labour; two had a sundry.
 */
export async function seedPastBrakeJobs(tag: string, counts: { main: number; other: number }): Promise<{ main: string[]; other: string[]; partTypeId: string }> {
  const prisma = db();
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' } });
  const second = await prisma.branch.findFirstOrThrow({ where: { businessUnitId: branch.businessUnitId, name: SECOND_BRANCH } });
  const store = await prisma.user.findUniqueOrThrow({ where: { email: 'store@e2e.test' } });
  const supervisor = await prisma.user.findUniqueOrThrow({ where: { email: 'supervisor@e2e.test' } });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: CUSTOMER.email } });

  const category = await prisma.partCategory.findFirstOrThrow({ where: { branchId: branch.id, name: 'E2E Seed Parts' } });
  const type = await prisma.partType.upsert({
    where: { branchId_categoryId_name: { branchId: branch.id, categoryId: category.id, name: PREDICT_PART.type } },
    update: {},
    create: { branchId: branch.id, categoryId: category.id, name: PREDICT_PART.type, createdById: store.id },
  });
  const part = await prisma.part.upsert({
    where: { branchId_partNumber: { branchId: branch.id, partNumber: PREDICT_PART.number } },
    update: {},
    create: { branchId: branch.id, name: PREDICT_PART.name, partNumber: PREDICT_PART.number, category: 'E2E Seed Parts', partTypeId: type.id, baseUnitOfMeasure: 'Piece', sellingPrice: PREDICT_PART.price, targetMarginPercent: 30, createdById: store.id },
  });
  await prisma.partStock.upsert({ where: { partId: part.id }, update: {}, create: { partId: part.id, quantityOnHand: PREDICT_PART.stock } });

  const made: { main: string[]; other: string[] } = { main: [], other: [] };
  const labour = [12000, 14000, 15000, 16000, 18000, 15000, 13000, 17000];
  let i = 0;
  for (const [where, n] of [['main', counts.main], ['other', counts.other]] as const) {
    for (let k = 0; k < n; k++, i++) {
      const vehicle = await prisma.customerVehicle.create({ data: { customerId: customer.id, make: 'Toyota', model: 'Hilux', year: 2018 + (i % 3), vehicleType: 'PASSENGER', plateNumber: `PRD${tag}${i}`.slice(0, 20), mileage: 60000 + i * 1000 } });
      const number = `JC-E2EP-${tag}-${i}`;
      const opened = new Date(Date.now() - (30 + i) * 86_400_000);
      const job = await prisma.jobCard.create({
        data: {
          jobNumber: number, branchId: where === 'main' ? branch.id : second.id, customerId: customer.id, vehicleId: vehicle.id, createdById: supervisor.id,
          status: 'CHECKED_OUT', approvalStatus: 'APPROVED', mileageAtCheckIn: 60000 + i * 1000, createdAt: opened, completedAt: new Date(opened.getTime() + 2 * 86_400_000), closedAt: new Date(opened.getTime() + 3 * 86_400_000), checkedOutAt: new Date(opened.getTime() + 3 * 86_400_000),
          complaints: { create: [{ sequenceNumber: 1, description: `Brake pads squealing and grinding when braking ${tag}` }] },
        },
      });
      const lines = [
        { type: 'STORE_PART' as const, description: PREDICT_PART.type, quantity: 2, unitPrice: PREDICT_PART.price, amount: 2 * PREDICT_PART.price, partTypeId: where === 'main' ? type.id : null, matchedPartId: where === 'main' ? part.id : null },
        { type: 'LABOUR' as const, description: 'Labour for brake', quantity: 1, unitPrice: labour[i % labour.length]!, amount: labour[i % labour.length]! },
        ...(i < 2 ? [{ type: 'SUNDRY' as const, description: 'Brake cleaner', quantity: 1, unitPrice: 1000, amount: 1000 }] : []),
      ];
      await prisma.estimate.create({
        data: {
          jobCardId: job.id, status: 'MANAGER_APPROVED', createdById: supervisor.id, submittedAt: opened, approvedAt: opened, managerApprovedAt: opened,
          lineItems: { create: lines.map((l) => ({ ...l, enteredById: supervisor.id })) },
        },
      });
      made[where].push(number);
    }
  }
  return { ...made, partTypeId: type.id };
}

/** The organisation's Enyo prediction mode (null when never saved), and a way to set it. */
export async function predictionsMode(): Promise<string | null> {
  const org = await db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  return (await db().enyoSetting.findUnique({ where: { organisationId: org.id }, select: { predictionsMode: true } }))?.predictionsMode ?? null;
}
export async function setPredictionsMode(mode: 'SHADOW' | 'SUGGEST' | 'OFF'): Promise<void> {
  const org = await db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  await db().enyoSetting.upsert({ where: { organisationId: org.id }, update: { predictionsMode: mode }, create: { organisationId: org.id, predictionsMode: mode } });
}

/** The Enyo prediction stored for a Job Card, waiting up to `ms` for it (it is written after the response). */
export async function predictionFor(jobCardId: string, until: (p: { status: string }) => boolean = () => true, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    const p = await db().enyoPrediction.findUnique({ where: { kind_subjectType_subjectId: { kind: 'JOB_CARD_LINES', subjectType: 'JobCard', subjectId: jobCardId } } });
    if (p && until(p)) return p;
    if (Date.now() > end) throw new Error(`No Enyo prediction ${p ? `in the expected state (it is ${p.status})` : 'stored'} for Job Card ${jobCardId} after ${ms / 1000}s`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
