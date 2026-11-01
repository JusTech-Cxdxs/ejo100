'use server';

import { prisma, Prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { allows, authorize, getPrincipal, orgWhere, reachWhere, NOT_AVAILABLE } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { isCustomerLine } from '@/lib/estimate-billing';
import { sendCustomerAccessEmail, withdrawCustomerSetPasswordLinks } from '@/lib/customer-access';
import {
  applyCrmFilters, cleanEmail, cleanName, cleanOptional, cleanPhone, cleanPrimaryAddress, customerMoney, diffChanges, isOpenJob, lagosMonthStart,
  lagosYearStart, monthlySpend, normaliseTags, paginate, profileGaps, sortCrmRows, type CrmJob, type CrmRow,
} from '@/lib/crm';

/**
 * Customers (CRM). Every read and write is fenced to the person's own
 * organisation (the platform team sees all), as in the Workshop customer
 * lists. Jobs, payments and spend are fenced to the person's reach (their
 * branch for branch staff, the whole organisation for headquarters).
 *
 *  • crm.view   — the hub and the 360 pages.
 *  • crm.manage — edit details, contacts, addresses, notes, tags, portal access.
 */

class CrmError extends Error {}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** A customer of the person's own organisation — or "not available". */
async function fencedCustomer(id: string) {
  const c = id ? await prisma.customer.findFirst({ where: { id, ...(await orgWhere()) } }) : null;
  if (!c) throw new CrmError(NOT_AVAILABLE);
  return c;
}

export async function canSeeCrm(): Promise<boolean> {
  try {
    await requireUser();
    return await allows('crm.view');
  } catch {
    return false;
  }
}

/** Single-branch reach, as a branch id (null = organisation-wide). */
async function singleBranch(): Promise<string | null> {
  const reach = await reachWhere('crm.view');
  return typeof reach.branchId === 'string' ? reach.branchId : null;
}

// ── The hub ────────────────────────────────────────────────────────────

type StatRow = { id: string; openJobs: number; lastVisit: Date | null; netPaid: number; netYear: number; vehicles: number; lastSession: Date | null; hasAccount: boolean };

/** Per-customer figures for one organisation in one statement (the list,
 * the filters and the KPIs). Jobs and money limited to `branchId` if given. */
function hubStatsSql(organisationId: string | null, branchId: string | null, yearStart: Date): Prisma.Sql {
  const org = organisationId ? Prisma.sql`c."organisationId" = ${organisationId}` : Prisma.sql`TRUE`;
  const jb = branchId ? Prisma.sql`AND j."branchId" = ${branchId}` : Prisma.empty;
  const vb = branchId ? Prisma.sql`AND v."branchId" = ${branchId}` : Prisma.empty;
  const mb = branchId ? Prisma.sql`AND COALESCE(j."branchId", v."branchId") = ${branchId}` : Prisma.empty;
  const hb = branchId ? Prisma.sql`AND h."branchId" = ${branchId}` : Prisma.empty;
  return Prisma.sql`
    WITH cust AS (SELECT c.id FROM customers c WHERE ${org}),
    jc AS (
      SELECT j."customerId" AS cid,
             COUNT(*) FILTER (WHERE j.status::text NOT IN ('CLOSED','CHECKED_OUT','CANCELLED'))::int AS open,
             MAX(j."createdAt") AS last
      FROM job_cards j WHERE j."customerId" IN (SELECT id FROM cust) ${jb} GROUP BY 1
    ),
    vs AS (
      SELECT v."customerId" AS cid,
             COUNT(*) FILTER (WHERE v.status::text NOT IN ('SCHEDULED','CLOSED','COLLECTED','CANCELLED','ESCALATED'))::int AS open,
             MAX(v."checkedInAt") AS last
      FROM vehicle_services v WHERE v."customerId" IN (SELECT id FROM cust) ${vb} GROUP BY 1
    ),
    moves AS (
      SELECT p."jobCardId" AS jid, p."vehicleServiceId" AS vid, p.amount AS amount, p."recordedAt" AS at FROM payments p
      UNION ALL
      SELECT r."jobCardId", r."vehicleServiceId", -r.amount, r."recordedAt" FROM refunds r
    ),
    money AS (
      SELECT COALESCE(j."customerId", v."customerId") AS cid,
             SUM(m.amount) AS net,
             SUM(m.amount) FILTER (WHERE m.at >= ${yearStart}) AS year
      FROM moves m
      LEFT JOIN job_cards j ON j.id = m.jid
      LEFT JOIN vehicle_services v ON v.id = m.vid
      WHERE COALESCE(j."customerId", v."customerId") IN (SELECT id FROM cust) ${mb}
      GROUP BY 1
    ),
    -- Invoices from SAP before EJO 100 (v-A3): read-only history, counted as spend and as visits on their dates.
    hist AS (
      SELECT h."customerId" AS cid,
             SUM(h.amount) AS net,
             SUM(h.amount) FILTER (WHERE h."invoiceDate" >= (${yearStart}::timestamptz AT TIME ZONE 'Africa/Lagos')::date) AS year,
             MAX(h."invoiceDate")::timestamp AS last
      FROM historical_invoices h
      WHERE h."voidedAt" IS NULL AND h."customerId" IN (SELECT id FROM cust) ${hb}
      GROUP BY 1
    ),
    veh AS (SELECT "customerId" AS cid, COUNT(*)::int AS n FROM customer_vehicles WHERE "customerId" IN (SELECT id FROM cust) GROUP BY 1),
    sess AS (SELECT "customerId" AS cid, MAX("createdAt") AS last FROM customer_sessions WHERE "customerId" IN (SELECT id FROM cust) GROUP BY 1),
    acc AS (SELECT DISTINCT "customerId" AS cid FROM customer_accounts WHERE "providerId" = 'credential' AND "customerId" IN (SELECT id FROM cust))
    SELECT cust.id,
           (COALESCE(jc.open, 0) + COALESCE(vs.open, 0))::int AS "openJobs",
           GREATEST(jc.last, vs.last, hist.last) AS "lastVisit",
           (COALESCE(money.net, 0) + COALESCE(hist.net, 0))::float8 AS "netPaid",
           (COALESCE(money.year, 0) + COALESCE(hist.year, 0))::float8 AS "netYear",
           COALESCE(veh.n, 0)::int AS vehicles,
           sess.last AS "lastSession",
           (acc.cid IS NOT NULL) AS "hasAccount"
    FROM cust
    LEFT JOIN jc ON jc.cid = cust.id
    LEFT JOIN vs ON vs.cid = cust.id
    LEFT JOIN money ON money.cid = cust.id
    LEFT JOIN hist ON hist.cid = cust.id
    LEFT JOIN veh ON veh.cid = cust.id
    LEFT JOIN sess ON sess.cid = cust.id
    LEFT JOIN acc ON acc.cid = cust.id`;
}

export type CrmHubParams = { q?: string; type?: string; tag?: string; status?: string; open?: string; portal?: string; gaps?: string; sort?: string; page?: string };

export async function getCrmHub(params: CrmHubParams = {}) {
  await authorize('crm.view', undefined, 'getCrmHub');
  const p = await getPrincipal();
  const fence = await orgWhere();
  const branchId = await singleBranch();
  const now = new Date();
  const q = params.q?.trim().slice(0, 100) ?? '';

  const [customers, stats, matches, branch] = await Promise.all([
    prisma.customer.findMany({
      where: fence,
      select: { id: true, fullName: true, email: true, phone: true, altPhone: true, address: true, customerType: true, tags: true, isActive: true, createdAt: true, customerSince: true, lastLoginAt: true },
    }),
    prisma.$queryRaw<StatRow[]>(hubStatsSql(fence.organisationId ?? null, branchId, lagosYearStart(now))),
    // Search runs in the database: name, email, either phone, or a vehicle's plate / chassis.
    q
      ? prisma.customer.findMany({
          where: {
            ...fence,
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { altPhone: { contains: q, mode: 'insensitive' } },
              { vehicles: { some: { OR: [{ plateNumber: { contains: q, mode: 'insensitive' } }, { chassisNumber: { contains: q, mode: 'insensitive' } }] } } },
            ],
          },
          select: { id: true },
          take: 2000,
        })
      : Promise.resolve(null),
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const byId = new Map(stats.map((s) => [s.id, s]));
  type Row = CrmRow & { email: string | null; altPhone: string | null; lastSignIn: Date | null; netYear: number };
  const all: Row[] = customers.map((c: (typeof customers)[number]) => {
    const s = byId.get(c.id);
    const lastSession = s?.lastSession ? new Date(s.lastSession) : null;
    const lastSignIn = [c.lastLoginAt, lastSession].filter((d): d is Date => Boolean(d)).sort((a, b) => +b - +a)[0] ?? null;
    return {
      id: c.id, fullName: c.fullName, email: c.email, customerType: c.customerType, tags: c.tags ?? [], isActive: c.isActive, createdAt: c.createdAt, customerSince: c.customerSince,
      address: c.address, phone: c.phone, altPhone: c.altPhone, hasPortalAccount: Boolean(s?.hasAccount), lastLoginAt: lastSignIn, lastSignIn,
      vehicles: num(s?.vehicles), openJobs: num(s?.openJobs), netPaid: num(s?.netPaid), netYear: num(s?.netYear), lastVisit: s?.lastVisit ? new Date(s.lastVisit) : null,
    };
  });

  // KPIs — always over every customer (filters never change them).
  const d90 = +now - 90 * 86400000;
  const monthStart = lagosMonthStart(now);
  const kpis = {
    total: all.length,
    active90: all.filter((r) => r.lastVisit && +r.lastVisit >= d90).length,
    // New to the business, not new to the system: a customer imported from SAP counts from their SAP creation date.
    newThisMonth: all.filter((r) => +(r.customerSince ?? r.createdAt) >= +monthStart).length,
    withPortal: all.filter((r) => r.isActive && r.hasPortalAccount).length,
    signedIn: all.filter((r) => r.lastSignIn).length,
    neverSignedIn: all.filter((r) => r.isActive && !r.lastSignIn).length,
    portalOff: all.filter((r) => !r.isActive).length,
    profileGaps: all.filter((r) => profileGaps(r).length > 0).length,
    spendThisYear: Math.round(all.reduce((s, r) => s + r.netYear, 0) * 100) / 100,
    withOpenJobs: all.filter((r) => r.openJobs > 0).length,
  };
  const topSpenders = [...all].filter((r) => r.netYear > 0).sort((a, b) => b.netYear - a.netYear).slice(0, 5).map((r) => ({ id: r.id, fullName: r.fullName, netYear: r.netYear }));
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));

  const matched = matches ? new Set(matches.map((m: { id: string }) => m.id)) : null;
  const filtered = sortCrmRows(applyCrmFilters(matched ? all.filter((r) => matched.has(r.id)) : all, params), params.sort);
  const page = paginate(filtered, params.page);

  const [canManage, canRegister] = await Promise.all([allows('crm.manage'), allows('workshop.customer.manage')]);
  return {
    kpis, topSpenders, tags,
    rows: page.items, page: page.page, pages: page.pages, matching: page.total,
    scope: branchId ? { branchOnly: true as const, branchName: branch?.name ?? 'your branch' } : { branchOnly: false as const, branchName: null },
    canManage, canRegister: canRegister || canManage, isPlatformTeam: p.isSuperAdmin,
  };
}

/** Customer picker for broadcasts and the CRM (search as you type). */
export async function searchCrmCustomers(query: string): Promise<{ id: string; fullName: string; email: string | null; phone: string | null }[]> {
  if (!(await allows('notifications.broadcast.send'))) await authorize('crm.view', undefined, 'searchCrmCustomers');
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  return prisma.customer.findMany({
    where: {
      ...(await orgWhere()),
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { vehicles: { some: { plateNumber: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    orderBy: { fullName: 'asc' },
    take: 20,
    select: { id: true, fullName: true, email: true, phone: true },
  });
}

/** Names for a set of customer ids (e.g. a broadcast's audience) — own organisation only. */
export async function getCustomerNames(customerIds: string[]): Promise<{ id: string; fullName: string }[]> {
  // Broadcasters (choosing customers) or people who may see the CRM.
  if (!(await allows('notifications.broadcast.send'))) await authorize('crm.view', undefined, 'getCustomerNames');
  const ids = [...new Set(customerIds.filter(Boolean))].slice(0, 1000);
  if (!ids.length) return [];
  return prisma.customer.findMany({ where: { id: { in: ids }, ...(await orgWhere()) }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
}

// ── The customer 360 ───────────────────────────────────────────────────

export async function getCustomer360(customerId: string) {
  await authorize('crm.view', undefined, 'getCustomer360');
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...(await orgWhere()) },
    include: {
      createdBy: { select: { fullName: true } },
      customerCompany: { select: { companyName: true, taxId: true } },
      addresses: { orderBy: { createdAt: 'asc' } },
      contacts: { orderBy: { createdAt: 'asc' } },
      notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }], take: 200, include: { author: { select: { id: true, fullName: true } } } },
      accounts: { where: { providerId: 'credential' }, select: { createdAt: true }, take: 1 },
      sessions: { orderBy: { createdAt: 'desc' }, select: { createdAt: true }, take: 1 },
    },
  });
  if (!customer) return null;
  const me = await getPrincipal();
  const reach = await reachWhere('crm.view', { lens: false });
  const branchId = typeof reach.branchId === 'string' ? reach.branchId : null;
  const jobWhere = { customerId: customer.id, ...reach };
  const pay = { select: { id: true, amount: true, method: true, notes: true, recordedAt: true, recordedBy: { select: { fullName: true } } } } as const;
  const ref = { select: { id: true, referenceNumber: true, amount: true, method: true, reason: true, recordedAt: true, recordedBy: { select: { fullName: true } } } } as const;

  const [vehicles, jcs, svs, warranties, claims, link, branch, sapRows] = await Promise.all([
    prisma.customerVehicle.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, select: { id: true, plateNumber: true, chassisNumber: true, make: true, model: true, year: true, vehicleType: true, mileage: true, createdAt: true } }),
    prisma.jobCard.findMany({
      where: jobWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, jobNumber: true, status: true, vehicleId: true, createdAt: true, completedAt: true, checkedOutAt: true, closedAt: true,
        branch: { select: { name: true } },
        cancellationRequests: { where: { status: 'APPROVED' }, orderBy: { decidedAt: 'desc' }, take: 1, select: { decidedAt: true } },
        estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } },
        payments: pay, refunds: ref,
      },
    }),
    prisma.vehicleService.findMany({
      where: jobWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, serviceNumber: true, status: true, vehicleId: true, createdAt: true, checkedInAt: true, completedAt: true, collectedAt: true, closedAt: true, cancelledAt: true,
        branch: { select: { name: true } },
        serviceEstimate: { select: { lineItems: { select: { amount: true } } } },
        payments: pay, refunds: ref,
      },
    }),
    prisma.warranty.findMany({ where: { customerId: customer.id, customer: await orgWhere() }, orderBy: { issuedAt: 'desc' }, take: 200, select: { id: true, warrantyNumber: true, kind: true, status: true, subjectDescription: true, startsAt: true, endsAt: true, vehicleId: true } }),
    prisma.warrantyClaim.findMany({ where: { customerId: customer.id, customer: await orgWhere() }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, claimNumber: true, status: true, createdAt: true, warranty: { select: { warrantyNumber: true } } } }),
    prisma.customerVerification.findFirst({ where: { value: customer.id, identifier: { startsWith: 'reset-password:' }, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'desc' }, select: { expiresAt: true, createdAt: true } }),
    branchId ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }) : Promise.resolve(null),
    // Invoices from SAP before EJO (read-only history), within the same branch scope as the jobs.
    prisma.historicalInvoice.findMany({
      where: { customerId: customer.id, organisationId: customer.organisationId, voidedAt: null, ...(branchId ? { branchId } : {}) },
      orderBy: { invoiceDate: 'desc' },
      take: 2000,
      select: { id: true, invoiceNumber: true, invoiceDate: true, amount: true, vehicleId: true, vin: true, documentType: true, description: true, branchId: true },
    }),
  ]);

  const plate = new Map(vehicles.map((v: (typeof vehicles)[number]) => [v.id, v.plateNumber || v.chassisNumber || [v.make, v.model].filter(Boolean).join(' ') || 'Vehicle']));
  const moneyRows = (xs: { amount: unknown; recordedAt: Date }[]) => xs.map((x) => ({ at: x.recordedAt, amount: num(x.amount) }));
  const jcCancelled = (j: (typeof jcs)[number]) => {
    if (j.status === 'CANCELLED') return true;
    const c = j.cancellationRequests[0]?.decidedAt;
    return Boolean(c && (!j.completedAt || +new Date(c) > +new Date(j.completedAt)));
  };
  type JobRow = CrmJob & { number: string; status: string; vehicleId: string; vehicleLabel: string; branchName: string; openedAt: Date; href: string; open: boolean };
  const jobs: JobRow[] = [
    ...jcs.map((j: (typeof jcs)[number]) => ({
      kind: 'JC' as const, id: j.id, number: j.jobNumber, status: j.status, vehicleId: j.vehicleId, vehicleLabel: plate.get(j.vehicleId) ?? 'Vehicle', branchName: j.branch?.name ?? '',
      openedAt: j.createdAt, receivedAt: j.createdAt, finishedAt: jcCancelled(j) ? null : j.completedAt ?? j.checkedOutAt ?? j.closedAt ?? null, cancelled: jcCancelled(j),
      customerBilled: (j.estimate?.lineItems ?? []).filter(isCustomerLine).reduce((s: number, l: { amount: unknown }) => s + num(l.amount), 0),
      payments: moneyRows(j.payments), refunds: moneyRows(j.refunds), href: `/workshop/job-cards/${j.id}`, open: isOpenJob('JC', j.status),
    })),
    ...svs.map((v: (typeof svs)[number]) => ({
      kind: 'SV' as const, id: v.id, number: v.serviceNumber, status: v.status, vehicleId: v.vehicleId, vehicleLabel: plate.get(v.vehicleId) ?? 'Vehicle', branchName: v.branch?.name ?? '',
      openedAt: v.createdAt,
      // An escalated service's work and money continue on its Job Card — it is not a visit of its own.
      receivedAt: v.status === 'ESCALATED' ? null : v.checkedInAt,
      finishedAt: v.status === 'CANCELLED' || v.cancelledAt || v.status === 'ESCALATED' ? null : v.completedAt ?? v.collectedAt ?? v.closedAt ?? null,
      cancelled: v.status === 'CANCELLED' || Boolean(v.cancelledAt),
      customerBilled: (v.serviceEstimate?.lineItems ?? []).reduce((s: number, l: { amount: unknown }) => s + num(l.amount), 0),
      payments: moneyRows(v.payments), refunds: moneyRows(v.refunds), href: `/workshop/vehicle-service/${v.id}`, open: isOpenJob('SV', v.status),
    })),
  ].sort((a, b) => +b.openedAt - +a.openedAt);

  const now = new Date();
  // A date-only invoice day counts at midday Lagos time (never the evening before in UTC).
  const sap = sapRows.map((h: (typeof sapRows)[number]) => ({ at: new Date(`${h.invoiceDate.toISOString().slice(0, 10)}T12:00:00+01:00`), amount: num(h.amount) }));
  const money = customerMoney(jobs, now, sap);
  const months = monthlySpend(jobs, now, 12, sap);
  const jobPaid = (j: JobRow) => j.payments.reduce((s, x) => s + x.amount, 0) - j.refunds.reduce((s, x) => s + x.amount, 0);

  const ledger = [
    ...jcs.flatMap((j: (typeof jcs)[number]) => [
      ...j.payments.map((p: (typeof j.payments)[number]) => ({ kind: 'payment' as const, id: p.id, at: p.recordedAt, amount: num(p.amount), method: p.method, note: p.notes, by: p.recordedBy?.fullName ?? null, reference: null as string | null, jobNumber: j.jobNumber, href: `/workshop/job-cards/${j.id}` })),
      ...j.refunds.map((r: (typeof j.refunds)[number]) => ({ kind: 'refund' as const, id: r.id, at: r.recordedAt, amount: num(r.amount), method: r.method, note: r.reason, by: r.recordedBy?.fullName ?? null, reference: r.referenceNumber, jobNumber: j.jobNumber, href: `/workshop/job-cards/${j.id}` })),
    ]),
    ...svs.flatMap((v: (typeof svs)[number]) => [
      ...v.payments.map((p: (typeof v.payments)[number]) => ({ kind: 'payment' as const, id: p.id, at: p.recordedAt, amount: num(p.amount), method: p.method, note: p.notes, by: p.recordedBy?.fullName ?? null, reference: null as string | null, jobNumber: v.serviceNumber, href: `/workshop/vehicle-service/${v.id}` })),
      ...v.refunds.map((r: (typeof v.refunds)[number]) => ({ kind: 'refund' as const, id: r.id, at: r.recordedAt, amount: num(r.amount), method: r.method, note: r.reason, by: r.recordedBy?.fullName ?? null, reference: r.referenceNumber, jobNumber: v.serviceNumber, href: `/workshop/vehicle-service/${v.id}` })),
    ]),
  ].sort((a, b) => +b.at - +a.at);

  const lastSignIn = [customer.lastLoginAt, customer.sessions[0]?.createdAt].filter((d): d is Date => Boolean(d)).sort((a, b) => +b - +a)[0] ?? null;
  const vehicleStats = vehicles.map((v: (typeof vehicles)[number]) => {
    const mine = jobs.filter((j) => j.vehicleId === v.id);
    const visited = mine.filter((j) => j.receivedAt).map((j) => j.receivedAt!) as Date[];
    const hist = sapRows.filter((h: (typeof sapRows)[number]) => h.vehicleId === v.id);
    const histVisits = hist.map((h: (typeof sapRows)[number]) => new Date(`${h.invoiceDate.toISOString().slice(0, 10)}T12:00:00+01:00`));
    return {
      ...v, jobs: mine.length, openJobs: mine.filter((j) => j.open).length,
      lastVisit: [...visited, ...histVisits].sort((a, b) => +b - +a)[0] ?? null,
      netPaid: Math.round((mine.reduce((s, j) => s + jobPaid(j), 0) + hist.reduce((s: number, h: (typeof sapRows)[number]) => s + num(h.amount), 0)) * 100) / 100,
      sapInvoices: hist.length,
    };
  });
  const activeWarranties = warranties.filter((w: (typeof warranties)[number]) => w.status === 'ACTIVE' && +new Date(w.endsAt) > +now).length;

  const [canManage, canOpenJobs, canWarranty, canBroadcast] = await Promise.all([allows('crm.manage'), allows('workshop.job_card.create'), allows('warranty.view'), allows('notifications.broadcast.send')]);
  return {
    customer: {
      id: customer.id, fullName: customer.fullName, customerType: customer.customerType, email: customer.email, phone: customer.phone, altPhone: customer.altPhone,
      address: customer.address, tags: customer.tags ?? [], isActive: customer.isActive, notifyByEmail: customer.notifyByEmail, createdAt: customer.createdAt, updatedAt: customer.updatedAt,
      customerSince: customer.customerSince, externalId: customer.externalId, externalSource: customer.externalSource,
      createdBy: customer.createdBy?.fullName ?? null, company: customer.customerCompany, gaps: profileGaps(customer),
    },
    portal: { hasAccount: customer.accounts.length > 0, lastSignIn, pendingLinkExpiresAt: link?.expiresAt ?? null, linkSentAt: link?.createdAt ?? null },
    addresses: customer.addresses,
    contacts: customer.contacts,
    notes: customer.notes.map((n: (typeof customer.notes)[number]) => ({ id: n.id, body: n.body, pinned: n.pinned, createdAt: n.createdAt, author: n.author?.fullName ?? 'Former staff member', mine: n.authorId === me.userId })),
    vehicles: vehicleStats,
    jobs: jobs.map((j) => ({ kind: j.kind, id: j.id, number: j.number, status: j.status, vehicleId: j.vehicleId, vehicleLabel: j.vehicleLabel, branchName: j.branchName, openedAt: j.openedAt, finishedAt: j.finishedAt, cancelled: j.cancelled, open: j.open, href: j.href, customerBilled: Math.round(j.customerBilled * 100) / 100, paid: Math.round(jobPaid(j) * 100) / 100 })),
    ledger,
    /** Invoices from SAP before EJO 100 — read-only history (v-A3). */
    sapInvoices: sapRows.map((h: (typeof sapRows)[number]) => ({ id: h.id, number: h.invoiceNumber, date: h.invoiceDate.toISOString().slice(0, 10), amount: num(h.amount), vehicleLabel: h.vehicleId ? plate.get(h.vehicleId) ?? h.vin : h.vin, documentType: h.documentType, description: h.description })),
    warranties,
    claims,
    money: { ...money, activeWarranties },
    months,
    scope: branchId ? { branchOnly: true as const, branchName: branch?.name ?? 'your branch' } : { branchOnly: false as const, branchName: null },
    can: { manage: canManage, openJobs: canOpenJobs, warranty: canWarranty, broadcast: canBroadcast },
  };
}
export type Customer360 = NonNullable<Awaited<ReturnType<typeof getCustomer360>>>;

export type CustomerActivityEntry = { id: string; at: Date; action: string; entityType: string; entityId: string | null; actor: 'staff' | 'customer' | 'system'; who: string | null; metadata: Record<string, unknown> | null };

/** The customer's own audit trail (staff and customer actions), plus the
 * business events of their Job Cards and Vehicle Services within reach. */
export async function getCustomerActivity(customerId: string, take = 150): Promise<CustomerActivityEntry[]> {
  await authorize('crm.view', undefined, 'getCustomerActivity');
  const customer = await fencedCustomer(customerId);
  const reach = await reachWhere('crm.view', { lens: false });
  const [jcIds, svIds] = await Promise.all([
    prisma.jobCard.findMany({ where: { customerId: customer.id, ...reach }, select: { id: true }, take: 300 }),
    prisma.vehicleService.findMany({ where: { customerId: customer.id, ...reach }, select: { id: true }, take: 300 }),
  ]);
  const rows = await prisma.auditLog.findMany({
    where: {
      action: { not: 'access.denied' },
      OR: [
        { entityType: 'Customer', entityId: customer.id },
        ...(jcIds.length ? [{ entityType: 'JobCard', entityId: { in: jcIds.map((j: { id: string }) => j.id) } }] : []),
        ...(svIds.length ? [{ entityType: 'VehicleService', entityId: { in: svIds.map((v: { id: string }) => v.id) } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(take, 10), 400),
  });
  const userIds = [...new Set(rows.map((r: (typeof rows)[number]) => r.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return rows.map((r: (typeof rows)[number]) => {
    const meta = (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? r.metadata : null) as Record<string, unknown> | null;
    const actor = meta?.actor === 'customer' ? 'customer' : r.userId ? 'staff' : 'system';
    return { id: r.id, at: r.createdAt, action: r.action, entityType: r.entityType, entityId: r.entityId, actor, who: actor === 'customer' ? customer.fullName : r.userId ? name.get(r.userId) ?? 'Former staff member' : null, metadata: meta };
  });
}

// ── Changes (crm.manage) ───────────────────────────────────────────────

async function audit(actorId: string, customer: { id: string; organisationId: string }, verb: string, metadata: Record<string, unknown> = {}) {
  await writeAuditLog({ userId: actorId, organisationId: customer.organisationId, action: `customer.${verb}`, entityType: 'Customer', entityId: customer.id, metadata: { actor: 'staff', ...metadata } });
}

export type UpdateCustomerInput = {
  customerId: string;
  fullName: string;
  customerType: 'INDIVIDUAL' | 'ORGANIZATION';
  email: string;
  phone: string;
  altPhone?: string;
  address: string;
  tags: string[] | string;
  notifyByEmail?: boolean;
  companyName?: string;
  taxId?: string;
};

/** Edit a customer's details. Email stays unique across the platform; the
 * sign-in account is keyed by the customer id, so changing the email needs
 * nothing else. Every changed field is audited as { from, to }. */
export async function updateCustomer(input: UpdateCustomerInput): Promise<{ changed: number }> {
  await authorize('crm.manage', undefined, 'updateCustomer', 'Only front desk, managers and administrators can edit customers.');
  const me = await requireUser();
  const before = await fencedCustomer(input.customerId);
  const customerType: 'INDIVIDUAL' | 'ORGANIZATION' = input.customerType === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL';
  const next = {
    fullName: cleanName(input.fullName, customerType === 'ORGANIZATION' ? 'Organisation name' : 'Customer name'),
    customerType,
    // A customer imported without an email may stay without one (or get one now); an email already on
    // file can be changed but never removed, since the customer signs in to the portal with it.
    email: !before.email && !(input.email ?? '').trim() ? null : cleanEmail(input.email),
    phone: cleanPhone(input.phone, { required: true, label: 'Phone number' }),
    altPhone: cleanPhone(input.altPhone, { required: false, label: 'Second phone number' }),
    address: cleanPrimaryAddress(input.address),
    tags: normaliseTags(input.tags),
    ...(typeof input.notifyByEmail === 'boolean' ? { notifyByEmail: input.notifyByEmail } : {}),
  };
  if (next.altPhone && next.phone && next.altPhone.replace(/\D/g, '') === next.phone.replace(/\D/g, '')) throw new CrmError('The second phone number is the same as the primary one.');
  if (next.email && next.email !== before.email) {
    const taken = await prisma.customer.findUnique({ where: { email: next.email }, select: { id: true, organisationId: true } });
    if (taken && taken.id !== before.id) {
      throw new CrmError(taken.organisationId === before.organisationId ? 'Another customer already uses that email address — open their page instead.' : 'That email address is already registered on the platform — use a different email for this customer.');
    }
  }
  const companyName = customerType === 'ORGANIZATION' ? cleanOptional(input.companyName, 160, 'Company name') : null;
  const taxId = customerType === 'ORGANIZATION' ? cleanOptional(input.taxId, 40, 'Tax ID') : null;
  const company = await prisma.customerCompany.findUnique({ where: { customerId: before.id }, select: { companyName: true, taxId: true } });

  const changes = {
    ...diffChanges(before as unknown as Record<string, unknown>, next as Record<string, unknown>),
    ...diffChanges({ companyName: company?.companyName ?? null, taxId: company?.taxId ?? null }, { companyName, taxId }),
  };
  if (Object.keys(changes).length === 0) return { changed: 0 };

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.customer.update({ where: { id: before.id }, data: next });
    if (companyName) await tx.customerCompany.upsert({ where: { customerId: before.id }, create: { customerId: before.id, companyName, taxId }, update: { companyName, taxId } });
    else if (company) await tx.customerCompany.delete({ where: { customerId: before.id } });
  });
  await audit(me.id, before, 'updated', { changes });
  return { changed: Object.keys(changes).length };
}

/** Switch a customer's portal access off (signed out at once, unused links
 * withdrawn) or back on. */
export async function setCustomerPortalAccess(customerId: string, active: boolean, reason?: string): Promise<void> {
  await authorize('crm.manage', undefined, 'setCustomerPortalAccess', 'Only front desk, managers and administrators can change portal access.');
  const me = await requireUser();
  const c = await fencedCustomer(customerId);
  const why = cleanOptional(reason, 200, 'Reason');
  if (!active && (!why || why.length < 3)) throw new CrmError('Give a short reason for switching their access off.');
  if (c.isActive === active) throw new CrmError(active ? 'Their portal access is already on.' : 'Their portal access is already off.');
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.customer.update({ where: { id: c.id }, data: { isActive: active } });
    // Signed out everywhere, at once.
    if (!active) await tx.customerSession.deleteMany({ where: { customerId: c.id } });
  });
  if (!active) await withdrawCustomerSetPasswordLinks(c.id);
  await audit(me.id, c, active ? 'switched_on' : 'switched_off', { changes: { isActive: { from: !active, to: active } }, ...(why ? { reason: why } : {}) });
}

/** Email a new set-password link (72 hours; earlier links stop working). */
export async function sendCustomerSetPasswordLink(customerId: string): Promise<{ sent: boolean; reason?: string }> {
  await authorize('crm.manage', undefined, 'sendCustomerSetPasswordLink', 'Only front desk, managers and administrators can send portal links.');
  const me = await requireUser();
  const c = await fencedCustomer(customerId);
  if (!c.isActive) throw new CrmError('Their portal access is switched off — switch it on first.');
  return sendCustomerAccessEmail(c.id, 'access', me.id);
}

// Addresses (extra — the primary one is on the customer itself).
export type AddressInput = { label?: string; line1: string; line2?: string; city?: string; state?: string; country?: string };

function cleanAddress(a: AddressInput) {
  const line1 = cleanOptional(a.line1, 160, 'Address');
  if (!line1) throw new CrmError('Enter the address.');
  return {
    label: cleanOptional(a.label, 40, 'Label'), line1, line2: cleanOptional(a.line2, 160, 'Address line 2'),
    city: cleanOptional(a.city, 80, 'City'), state: cleanOptional(a.state, 80, 'State'), country: cleanOptional(a.country, 80, 'Country'),
  };
}

export async function addCustomerAddress(customerId: string, input: AddressInput): Promise<void> {
  await authorize('crm.manage', undefined, 'addCustomerAddress');
  const me = await requireUser();
  const c = await fencedCustomer(customerId);
  if ((await prisma.customerAddress.count({ where: { customerId: c.id } })) >= 20) throw new CrmError('A customer can have at most 20 extra addresses.');
  const data = cleanAddress(input);
  const a = await prisma.customerAddress.create({ data: { customerId: c.id, ...data } });
  await audit(me.id, c, 'address_added', { addressId: a.id, changes: diffChanges({}, data as Record<string, unknown>) });
}

async function fencedCustomerAddress(addressId: string) {
  const a = addressId ? await prisma.customerAddress.findFirst({ where: { id: addressId, customer: await orgWhere() }, include: { customer: { select: { id: true, organisationId: true } } } }) : null;
  if (!a) throw new CrmError(NOT_AVAILABLE);
  return a;
}

export async function updateCustomerAddress(addressId: string, input: AddressInput): Promise<void> {
  await authorize('crm.manage', undefined, 'updateCustomerAddress');
  const me = await requireUser();
  const before = await fencedCustomerAddress(addressId);
  const data = cleanAddress(input);
  const changes = diffChanges(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
  if (!Object.keys(changes).length) return;
  await prisma.customerAddress.update({ where: { id: before.id }, data });
  await audit(me.id, before.customer, 'address_updated', { addressId: before.id, changes });
}

export async function removeCustomerAddress(addressId: string): Promise<void> {
  await authorize('crm.manage', undefined, 'removeCustomerAddress');
  const me = await requireUser();
  const a = await fencedCustomerAddress(addressId);
  await prisma.customerAddress.delete({ where: { id: a.id } });
  await audit(me.id, a.customer, 'address_removed', { addressId: a.id, removed: [a.label, a.line1, a.city].filter(Boolean).join(', ') });
}

// Contact people (mainly for organisations — e.g. the fleet manager).
export type ContactInput = { name: string; role?: string; phone?: string; email?: string };

function cleanContact(c: ContactInput) {
  const email = c.email?.trim() ? cleanEmail(c.email) : null;
  const phone = cleanPhone(c.phone, { required: false, label: 'Contact phone' });
  if (!email && !phone) throw new CrmError('Give the contact person a phone number or an email address.');
  return { name: cleanName(c.name, 'Contact name'), role: cleanOptional(c.role, 60, 'Role'), phone, email };
}

export async function addCustomerContact(customerId: string, input: ContactInput): Promise<void> {
  await authorize('crm.manage', undefined, 'addCustomerContact');
  const me = await requireUser();
  const c = await fencedCustomer(customerId);
  if ((await prisma.customerContact.count({ where: { customerId: c.id } })) >= 30) throw new CrmError('A customer can have at most 30 contact people.');
  const data = cleanContact(input);
  const row = await prisma.customerContact.create({ data: { customerId: c.id, ...data } });
  await audit(me.id, c, 'contact_added', { contactId: row.id, changes: diffChanges({}, data as Record<string, unknown>) });
}

async function fencedCustomerContact(contactId: string) {
  const row = contactId ? await prisma.customerContact.findFirst({ where: { id: contactId, customer: await orgWhere() }, include: { customer: { select: { id: true, organisationId: true } } } }) : null;
  if (!row) throw new CrmError(NOT_AVAILABLE);
  return row;
}

export async function updateCustomerContact(contactId: string, input: ContactInput): Promise<void> {
  await authorize('crm.manage', undefined, 'updateCustomerContact');
  const me = await requireUser();
  const before = await fencedCustomerContact(contactId);
  const data = cleanContact(input);
  const changes = diffChanges(before as unknown as Record<string, unknown>, data as Record<string, unknown>);
  if (!Object.keys(changes).length) return;
  await prisma.customerContact.update({ where: { id: before.id }, data });
  await audit(me.id, before.customer, 'contact_updated', { contactId: before.id, changes });
}

export async function removeCustomerContact(contactId: string): Promise<void> {
  await authorize('crm.manage', undefined, 'removeCustomerContact');
  const me = await requireUser();
  const row = await fencedCustomerContact(contactId);
  await prisma.customerContact.delete({ where: { id: row.id } });
  await audit(me.id, row.customer, 'contact_removed', { contactId: row.id, removed: row.name });
}

// Notes — internal, never shown to the customer.
export async function addCustomerNote(customerId: string, body: string, pinned = false): Promise<void> {
  await authorize('crm.manage', undefined, 'addCustomerNote');
  const me = await requireUser();
  const c = await fencedCustomer(customerId);
  const text = String(body ?? '').trim();
  if (text.length < 2) throw new CrmError('Write the note first.');
  if (text.length > 2000) throw new CrmError('A note can be at most 2,000 characters.');
  const n = await prisma.customerNote.create({ data: { customerId: c.id, authorId: me.id, body: text, pinned } });
  await audit(me.id, c, 'note_added', { noteId: n.id, pinned, preview: text.slice(0, 120) });
}

async function fencedCustomerNote(noteId: string) {
  const n = noteId ? await prisma.customerNote.findFirst({ where: { id: noteId, customer: await orgWhere() }, include: { customer: { select: { id: true, organisationId: true } } } }) : null;
  if (!n) throw new CrmError(NOT_AVAILABLE);
  return n;
}

export async function setCustomerNotePinned(noteId: string, pinned: boolean): Promise<void> {
  await authorize('crm.manage', undefined, 'setCustomerNotePinned');
  const me = await requireUser();
  const n = await fencedCustomerNote(noteId);
  if (n.pinned === pinned) return;
  await prisma.customerNote.update({ where: { id: n.id }, data: { pinned } });
  await audit(me.id, n.customer, pinned ? 'note_pinned' : 'note_unpinned', { noteId: n.id, preview: n.body.slice(0, 120) });
}

/** Only the person who wrote a note can delete it. */
export async function deleteCustomerNote(noteId: string): Promise<void> {
  await authorize('crm.manage', undefined, 'deleteCustomerNote');
  const me = await requireUser();
  const n = await fencedCustomerNote(noteId);
  if (n.authorId !== me.id) throw new CrmError('You can only delete notes you wrote yourself.');
  await prisma.customerNote.delete({ where: { id: n.id } });
  await audit(me.id, n.customer, 'note_deleted', { noteId: n.id, preview: n.body.slice(0, 120) });
}
