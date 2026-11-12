'use server';

/**
 * A4c1 — customers' data requests (NDPA 2023): record one as received, confirm
 * who is asking (a different person from the one who recorded it, so no one
 * alone can take a customer's data out under a request they made up), give
 * them a copy of their data (the download route), and close the request with
 * what was done or why it was refused. All of it needs
 * `privacy.requests.manage` across the organisation; fenced to the person's
 * own organisation; refused during an assisted session; every step audited,
 * each change of status set once (compare-and-set).
 */
import { Prisma, prisma } from '@ejo/database';
import { authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { checkVerifiedHow, isRequestKind, isVia, OPEN_STATUSES, requestNumber, type RequestKind } from '@/lib/privacy/requests';

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

async function privacyDesk(where: string) {
  const p = await getPrincipal();
  await authorize('privacy.requests.manage', undefined, where, 'Customers’ data requests are handled by the people your organisation names for them (the Administrator and the Customer Care Lead).');
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new Error('Your account is not placed in an organisation yet.');
  return { userId: p.userId, organisationId };
}

/** A customer of the person's own organisation, or null. */
async function requestCustomerOf(organisationId: string, id: string) {
  return prisma.customer.findFirst({ where: { id: String(id).slice(0, 40), organisationId }, select: { id: true } });
}

/** A request of the person's own organisation, or null. */
async function dataRequestOf(organisationId: string, id: string) {
  return prisma.dataRequest.findFirst({ where: { id: String(id).slice(0, 40), organisationId } });
}

const clean = (s: unknown, max: number) => String(s ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

export type RequestRow = { id: string; number: string; kind: RequestKind; status: string; receivedVia: string; receivedAt: Date; customer: { id: string; name: string } | null; days: number; packDownloads: number };

export async function listDataRequests(filter: 'open' | 'closed' | 'all' = 'open'): Promise<RequestRow[]> {
  const { organisationId } = await privacyDesk('/data-requests');
  const rows = await prisma.dataRequest.findMany({
    where: { organisationId, ...(filter === 'open' ? { status: { in: [...OPEN_STATUSES] } } : filter === 'closed' ? { status: { notIn: [...OPEN_STATUSES] } } : {}) },
    orderBy: filter === 'open' ? { receivedAt: 'asc' } : { receivedAt: 'desc' }, take: 200,
  });
  const customers = new Map((await prisma.customer.findMany({ where: { organisationId, id: { in: rows.map((r) => r.customerId) } }, select: { id: true, fullName: true } })).map((c) => [c.id, c.fullName]));
  const now = Date.now();
  return rows.map((r) => ({ id: r.id, number: r.number, kind: r.kind as RequestKind, status: r.status, receivedVia: r.receivedVia, receivedAt: r.receivedAt, customer: customers.has(r.customerId) ? { id: r.customerId, name: customers.get(r.customerId)! } : null, days: Math.max(0, Math.floor((now - +r.receivedAt) / 86_400_000)), packDownloads: r.packDownloads }));
}

/** Customers to pick from: by name, phone, email or SAP number, in the organisation (at most 10). */
export async function findCustomersForRequest(q: string): Promise<{ id: string; name: string; phone: string | null; email: string | null; externalId: string | null }[]> {
  const { organisationId } = await privacyDesk('/data-requests/new');
  const t = clean(q, 80);
  if (t.length < 2) return [];
  const rows = await prisma.customer.findMany({
    where: { organisationId, OR: [{ fullName: { contains: t, mode: 'insensitive' } }, { phone: { contains: t.replace(/\s+/g, '') } }, { email: { contains: t, mode: 'insensitive' } }, { externalId: t.replace(/^0+(?=\d)/, '') }] },
    orderBy: { fullName: 'asc' }, take: 10, select: { id: true, fullName: true, phone: true, email: true, externalId: true },
  });
  return rows.map((c) => ({ id: c.id, name: c.fullName, phone: c.phone, email: c.email, externalId: c.externalId }));
}

export async function recordDataRequest(input: { customerId: string; kind: string; receivedVia: string; receivedOn: string; details: string }): Promise<{ ok: true; id: string; number: string } | Fail> {
  const { userId, organisationId } = await privacyDesk('/data-requests/new');
  await refuseDuringAssist('recordDataRequest');
  if (!isRequestKind(input.kind)) return fail('Choose what they ask for.');
  if (!isVia(input.receivedVia)) return fail('Choose how the request came in.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.receivedOn))) return fail('Give the day it was received.');
  // The day in Lagos, at noon (so it is that day whatever the clock).
  const receivedAt = new Date(`${input.receivedOn}T11:00:00.000Z`);
  if (Number.isNaN(+receivedAt) || +receivedAt > Date.now() + 86_400_000 || +receivedAt < Date.now() - 366 * 86_400_000) return fail('The day received must be within the last year, and not in the future.');
  const details = clean(input.details, 2000);
  const customer = await requestCustomerOf(organisationId, input.customerId);
  if (!customer) return fail('Choose the customer from your organisation’s records.');
  const open = await prisma.dataRequest.findFirst({ where: { organisationId, customerId: customer.id, kind: input.kind, status: { in: [...OPEN_STATUSES] } }, select: { number: true } });
  if (open) return fail(`This customer already has an open request of this kind (${open.number}): answer that one.`);
  const year = new Date(Date.now() + 3_600_000).getUTCFullYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const made = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data-requests:${organisationId}`}))`;
        const prefix = `DR-${year}-`;
        const last = await tx.dataRequest.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
        const number = requestNumber(year, (last ? Number(last.number.slice(prefix.length)) || 0 : 0) + 1);
        const r = await tx.dataRequest.create({ data: { number, organisationId, customerId: customer.id, kind: input.kind, receivedVia: input.receivedVia, receivedAt, details: details || null, createdById: userId }, select: { id: true, number: true } });
        await tx.auditLog.create({ data: { organisationId, userId, action: 'privacy.request_recorded', entityType: 'DataRequest', entityId: r.id, metadata: { number, kind: input.kind, receivedVia: input.receivedVia, receivedOn: input.receivedOn, customerId: customer.id } } });
        return r;
      });
      return { ok: true, ...made };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  return fail('The request could not be numbered. Try again.');
}

export type RequestView = {
  id: string; number: string; kind: RequestKind; status: string; receivedVia: string; receivedAt: Date; details: string | null; createdAt: Date;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  verifiedAt: Date | null; verifiedHow: string | null; packAt: Date | null; packChecksum: string | null; packDownloads: number; closedAt: Date | null; outcome: string | null;
  recordedByMe: boolean; verifiedByMe: boolean; days: number;
};

export async function getDataRequest(id: string): Promise<RequestView | null> {
  const { userId, organisationId } = await privacyDesk(`/data-requests/${id}`);
  const r = await dataRequestOf(organisationId, id);
  if (!r) return null;
  const c = await prisma.customer.findFirst({ where: { id: r.customerId, organisationId }, select: { id: true, fullName: true, phone: true, email: true } });
  return {
    id: r.id, number: r.number, kind: r.kind as RequestKind, status: r.status, receivedVia: r.receivedVia, receivedAt: r.receivedAt, details: r.details, createdAt: r.createdAt,
    customer: c ? { id: c.id, name: c.fullName, phone: c.phone, email: c.email } : null,
    verifiedAt: r.verifiedAt, verifiedHow: r.verifiedHow, packAt: r.packAt, packChecksum: r.packChecksum, packDownloads: r.packDownloads, closedAt: r.closedAt, outcome: r.outcome,
    recordedByMe: r.createdById === userId, verifiedByMe: r.verifiedById === userId, days: Math.max(0, Math.floor((Date.now() - +r.receivedAt) / 86_400_000)),
  };
}

/** Who is asking is who the record is about: confirmed by someone other than the person who recorded the request. */
export async function verifyDataRequest(id: string, how: string): Promise<{ ok: true } | Fail> {
  const { userId, organisationId } = await privacyDesk(`/data-requests/${id}`);
  await refuseDuringAssist('verifyDataRequest');
  const r = await dataRequestOf(organisationId, id);
  if (!r) return fail('This request was not found.');
  if (r.status !== 'RECEIVED') return fail('This request is not waiting for its identity check.');
  if (r.createdById === userId) return fail('You recorded this request: a colleague confirms who is asking, so no one alone can take a customer’s data out.');
  const h = checkVerifiedHow(how);
  if (!h.ok) return fail(h.error);
  const done = await prisma.$transaction(async (tx) => {
    const n = await tx.dataRequest.updateMany({ where: { id: r.id, status: 'RECEIVED', createdById: { not: userId } }, data: { status: 'VERIFIED', verifiedById: userId, verifiedAt: new Date(), verifiedHow: h.text } });
    if (!n.count) return false;
    await tx.auditLog.create({ data: { organisationId, userId, action: 'privacy.request_verified', entityType: 'DataRequest', entityId: r.id, metadata: { number: r.number, how: h.text } } });
    return true;
  });
  return done ? { ok: true } : fail('This request changed meanwhile. Refresh the page.');
}

/**
 * Close: answered (a copy given — downloaded at least once — or the
 * correction, erasure or objection done), refused with the reason, or
 * withdrawn by the customer. Always with what was done, in words.
 */
export async function closeDataRequest(id: string, outcome: 'FULFILLED' | 'REFUSED' | 'WITHDRAWN', note: string): Promise<{ ok: true } | Fail> {
  const { userId, organisationId } = await privacyDesk(`/data-requests/${id}`);
  await refuseDuringAssist('closeDataRequest');
  if (!['FULFILLED', 'REFUSED', 'WITHDRAWN'].includes(outcome)) return fail('Choose how the request ends.');
  const r = await dataRequestOf(organisationId, id);
  if (!r) return fail('This request was not found.');
  if (!(OPEN_STATUSES as readonly string[]).includes(r.status)) return fail('This request is already closed.');
  const text = clean(note, 2000);
  if (text.length < 10) return fail(outcome === 'FULFILLED' ? 'Say what was done (how the copy was sent, what was corrected, erased or stopped).' : outcome === 'REFUSED' ? 'Say why it was refused — the customer is told the reason.' : 'Say how the customer withdrew it.');
  if (outcome === 'FULFILLED') {
    if (r.status !== 'VERIFIED') return fail('Confirm who is asking before answering the request.');
    if (r.kind === 'ACCESS' && !r.packDownloads) return fail('Download their copy first: the request is answered with it.');
  }
  const done = await prisma.$transaction(async (tx) => {
    const n = await tx.dataRequest.updateMany({ where: { id: r.id, status: r.status }, data: { status: outcome, closedById: userId, closedAt: new Date(), outcome: text } });
    if (!n.count) return false;
    await tx.auditLog.create({ data: { organisationId, userId, action: 'privacy.request_closed', entityType: 'DataRequest', entityId: r.id, metadata: { number: r.number, outcome, note: text } } });
    return true;
  });
  return done ? { ok: true } : fail('This request changed meanwhile. Refresh the page.');
}
