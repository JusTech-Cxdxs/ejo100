import 'server-only';
/**
 * Loads who is writing to the Support centre (see context-core.ts for the
 * rules): the customer by the ticket's customer or the sender's address, the
 * colleague by their help request or address — always inside the ticket's
 * organisation — with portal access and sign-in history, their open and
 * recent records, a colleague's roles, recent errors, refused pages, what
 * they do most, and the how-to guides that fit their question and their own
 * permissions. Every query is organisation-fenced and capped.
 */
import { prisma } from '@ejo/database';
import { colleaguePrincipal } from '@/lib/authz/server';
import { searchGuide } from '@/lib/enyo/guide';
import { workProfile } from '@/lib/enyo/work-profile';
import { customerLinks } from '@/lib/customer-links-core';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import {
  customerLoginDiagnosis, linksForCustomer, linksForStaff, provenSender, senderKind, staffLoginDiagnosis,
  type CustomerFacts, type SenderContext, type StaffFacts,
} from './context-core';

const WEEK = 7 * 86_400_000;
const RECENT = 90 * 86_400_000;

export type ContextTicket = {
  organisationId: string; channel: string; contactEmail: string | null; customerId: string | null; requesterUserId?: string | null;
  authenticatedSender: boolean; verified: boolean;
};

/** A service visit has no "updated" stamp: its latest step is its last update. */
const lastOf = (s: { createdAt: Date; checkedInAt: Date | null; completedAt: Date | null; readyForCollectionAt: Date | null; closedAt: Date | null; collectedAt: Date | null; cancelledAt: Date | null; escalatedAt: Date | null }) =>
  new Date(Math.max(...[s.createdAt, s.checkedInAt, s.completedAt, s.readyForCollectionAt, s.closedAt, s.collectedAt, s.cancelledAt, s.escalatedAt].filter((d): d is Date => Boolean(d)).map((d) => d.getTime())));
const vehicleName = (v: { make: string | null; model: string | null } | null) => [v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle';
const reasonOf = (m: unknown) => (m && typeof m === 'object' && typeof (m as { reason?: unknown }).reason === 'string' ? String((m as { reason: string }).reason).slice(0, 200) : null);

export async function senderContext(t: ContextTicket, question = ''): Promise<SenderContext> {
  const email = t.contactEmail?.trim().toLowerCase() || null;
  const [customerRow, staffRow] = await Promise.all([
    t.customerId
      ? prisma.customer.findFirst({ where: { id: t.customerId, organisationId: t.organisationId }, select: { id: true, fullName: true, email: true, isActive: true, lastLoginAt: true } })
      : email && !t.requesterUserId ? prisma.customer.findFirst({ where: { organisationId: t.organisationId, email: { equals: email, mode: 'insensitive' } }, select: { id: true, fullName: true, email: true, isActive: true, lastLoginAt: true } }) : null,
    t.requesterUserId
      ? prisma.user.findFirst({ where: { id: t.requesterUserId, organisationId: t.organisationId }, select: STAFF_SELECT })
      : email ? prisma.user.findFirst({ where: { organisationId: t.organisationId, email: { equals: email, mode: 'insensitive' } }, select: STAFF_SELECT }) : null,
  ]).catch(() => [null, null] as const);

  const [customer, staff] = await Promise.all([
    customerRow ? customerFacts(t.organisationId, customerRow) : null,
    staffRow ? staffFacts(t.organisationId, staffRow, question, Boolean(t.requesterUserId)) : null,
  ]);
  const how = provenSender({
    channel: t.channel, authenticatedSender: t.authenticatedSender, verified: t.verified, ticketCustomerId: t.customerId, requesterUserId: t.requesterUserId ?? null,
    contactEmail: t.contactEmail, customerEmail: customerRow?.email ?? null, staffEmail: staffRow?.email ?? null,
  });
  const site = websiteBaseUrl();
  const kind = t.requesterUserId ? 'staff' : senderKind(Boolean(customer), Boolean(staff));
  const login = t.requesterUserId || (staff && !customer)
    ? (staff ? staffLoginDiagnosis(staff) : null)
    : customerLoginDiagnosis(customer);
  return {
    kind, proven: how !== 'none', provenHow: how, customer: t.requesterUserId ? null : customer, staff,
    customerLinks: site ? linksForCustomer(customer, customerLinks(site)) : [],
    staffLinks: linksForStaff(staff, portalBaseUrl()),
    login,
  };
}

const STAFF_SELECT = {
  id: true, fullName: true, email: true, isActive: true, lastLoginAt: true,
  branch: { select: { name: true } }, department: { select: { name: true } },
  roles: { select: { role: { select: { name: true, isSuperAdmin: true } } } },
} as const;

async function customerFacts(organisationId: string, c: { id: string; fullName: string; isActive: boolean; lastLoginAt: Date | null }): Promise<CustomerFacts> {
  const since = new Date(Date.now() - WEEK);
  const recent = new Date(Date.now() - RECENT);
  const [account, failed, lastFailed, reset, off, jobs, services, warranties, claims, errors, openRequests] = await Promise.all([
    prisma.customerAccount.findFirst({ where: { customerId: c.id, providerId: 'credential', password: { not: null } }, select: { id: true } }),
    prisma.auditLog.count({ where: { organisationId, action: 'customer.sign_in_failed', entityId: c.id, createdAt: { gte: since } } }),
    prisma.auditLog.findFirst({ where: { organisationId, action: 'customer.sign_in_failed', entityId: c.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.auditLog.findFirst({ where: { organisationId, action: 'customer.password_reset_requested', entityId: c.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    c.isActive ? null : prisma.auditLog.findFirst({ where: { organisationId, action: 'customer.switched_off', entityId: c.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadata: true, userId: true } }),
    prisma.jobCard.findMany({
      where: { customerId: c.id, customer: { organisationId }, OR: [{ status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } }, { updatedAt: { gte: recent } }] },
      orderBy: { updatedAt: 'desc' }, take: 5,
      select: { id: true, jobNumber: true, status: true, updatedAt: true, vehicle: { select: { make: true, model: true, plateNumber: true } } },
    }),
    prisma.vehicleService.findMany({
      where: { customerId: c.id, customer: { organisationId }, OR: [{ status: { notIn: ['COLLECTED', 'CANCELLED', 'ESCALATED'] } }, { createdAt: { gte: recent } }] },
      orderBy: { createdAt: 'desc' }, take: 5,
      select: {
        id: true, serviceNumber: true, status: true, createdAt: true, checkedInAt: true, completedAt: true, readyForCollectionAt: true, closedAt: true, collectedAt: true, cancelledAt: true, escalatedAt: true,
        vehicle: { select: { make: true, model: true, plateNumber: true } },
      },
    }),
    prisma.warranty.findMany({ where: { customerId: c.id, customer: { organisationId }, endsAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { endsAt: 'asc' }, take: 5, select: { id: true, warrantyNumber: true, status: true, subjectDescription: true, endsAt: true } }),
    prisma.warrantyClaim.findMany({ where: { customerId: c.id, customer: { organisationId }, updatedAt: { gte: recent } }, orderBy: { updatedAt: 'desc' }, take: 5, select: { claimNumber: true, status: true, updatedAt: true } }),
    prisma.errorEvent.findMany({ where: { customerId: c.id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 3, select: { ref: true, path: true, createdAt: true } }),
    prisma.supportTicket.count({ where: { organisationId, customerId: c.id, status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } } }),
  ]);
  const offBy = off?.userId ? (await prisma.user.findFirst({ where: { id: off.userId, organisationId }, select: { fullName: true } }))?.fullName ?? null : null;
  return {
    id: c.id, name: c.fullName,
    portal: {
      on: c.isActive, hasPassword: Boolean(account), lastLoginAt: c.lastLoginAt, failedRecently: failed, lastFailedAt: lastFailed?.createdAt ?? null,
      resetRequestedAt: reset?.createdAt ?? null, offReason: reasonOf(off?.metadata), offAt: off?.createdAt ?? null, offBy,
    },
    jobs: jobs.map((j) => ({ id: j.id, number: j.jobNumber, status: String(j.status), vehicle: vehicleName(j.vehicle), plate: j.vehicle?.plateNumber ?? null, updatedAt: j.updatedAt })),
    services: services.map((s) => ({ id: s.id, number: s.serviceNumber, status: String(s.status), vehicle: vehicleName(s.vehicle), plate: s.vehicle?.plateNumber ?? null, updatedAt: lastOf(s) })),
    warranties: warranties.map((w) => ({ id: w.id, number: w.warrantyNumber, status: String(w.status), subject: w.subjectDescription.slice(0, 120), endsAt: w.endsAt })),
    claims: claims.map((x) => ({ number: x.claimNumber, status: String(x.status), updatedAt: x.updatedAt })),
    errors: errors.map((e) => ({ ref: e.ref, path: e.path, at: e.createdAt })),
    openRequests,
  };
}

type StaffRow = { id: string; fullName: string; isActive: boolean; lastLoginAt: Date | null; branch: { name: string } | null; department: { name: string } | null; roles: { role: { name: string; isSuperAdmin: boolean } }[] };

/** `ownRequest`: their errors, refused pages and what they do most are loaded only for their own help request. */
async function staffFacts(organisationId: string, u: StaffRow, question: string, ownRequest: boolean): Promise<StaffFacts> {
  const since = new Date(Date.now() - WEEK);
  const [failed, lastFailed, deactivated, errors, denied, work, principal] = await Promise.all([
    prisma.auditLog.count({ where: { action: 'user.sign_in_failed', entityId: u.id, createdAt: { gte: since } } }),
    prisma.auditLog.findFirst({ where: { action: 'user.sign_in_failed', entityId: u.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    u.isActive ? null : prisma.auditLog.findFirst({ where: { organisationId, action: 'user.deactivated', entityId: u.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, metadata: true } }),
    ownRequest ? prisma.errorEvent.findMany({ where: { userId: u.id, app: 'portal', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 5, select: { ref: true, path: true, message: true, createdAt: true } }) : [],
    ownRequest ? prisma.auditLog.findMany({ where: { organisationId, userId: u.id, action: 'access.denied', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 5, select: { entityId: true, createdAt: true } }) : [],
    ownRequest ? workProfile(u.id, organisationId) : null,
    colleaguePrincipal(u.id).catch(() => null),
  ]).catch(() => [0, null, null, [], [], null, null] as const);
  const q = question.trim();
  const guides = principal && q ? searchGuide(q, principal, 3).results : [];
  return {
    id: u.id, name: u.fullName, active: u.isActive, roles: u.roles.map((r) => r.role.name), platformTeam: u.roles.some((r) => r.role.isSuperAdmin),
    branch: u.branch?.name ?? null, department: u.department?.name ?? null, lastLoginAt: u.lastLoginAt,
    failedRecently: failed, lastFailedAt: lastFailed?.createdAt ?? null,
    deactivatedReason: reasonOf(deactivated?.metadata), deactivatedAt: deactivated?.createdAt ?? null,
    errors: errors.map((e) => ({ ref: e.ref, path: e.path, message: e.message.replace(/\s+/g, ' ').slice(0, 300), at: e.createdAt })),
    denied: denied.map((d) => ({ page: d.entityId ?? 'a page', at: d.createdAt })),
    work,
    guides: guides.map((g) => ({ title: g.title, href: g.href, steps: g.steps, youCanDoThis: g.youCanDoThis })),
  };
}
