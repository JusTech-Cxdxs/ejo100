'use server';

import { prisma, type Prisma } from '@ejo/database';
import { authorize, allows, myOrganisationId, refuseDuringAssist, NOT_AVAILABLE } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { withinLimit } from '@/lib/mail/account';
import { recordUrl } from '@/lib/notification-rules';
import { scanOrganisation, type ScanResult } from '@/lib/integrity/scan';
import {
  ALERT_STATUS_LABEL, RULES, RULE_KEYS, SEVERITIES, SEVERITY_RANK, asAlertStatus, asSeverity,
  type AlertStatus, type RuleKey, type Severity,
} from '@/lib/integrity/core';

/**
 * The integrity watch, for reviewers (integrity.review — administrators by
 * default): alerts raised by the checks (lib/integrity/scan.ts) and by
 * colleagues (Speak up). Organisation-fenced. A reviewer never sees or
 * decides an alert about themselves — those go to another reviewer. Each
 * decision needs a written outcome and is in the audit trail.
 *
 * Speak up is open to everyone: a concern goes only to the reviewers, never
 * to the person it may be about, and the colleague may stay anonymous (then
 * nothing records who raised it).
 */

class IntegrityError extends Error {}
const PERM = 'integrity.review' as const;

async function integrityReviewer(where: string): Promise<{ id: string; organisationId: string }> {
  await authorize(PERM, undefined, where);
  await refuseDuringAssist(where);
  const me = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new IntegrityError('Your account is not placed in an organisation yet.');
  return { id: me.id, organisationId };
}

/** The alerts this reviewer may see: their organisation's, never about themselves. */
const visible = (r: { id: string; organisationId: string }): Prisma.IntegrityAlertWhereInput => ({
  organisationId: r.organisationId,
  OR: [{ subjectUserId: null }, { subjectUserId: { not: r.id } }],
});

export type AlertRow = {
  id: string; rule: RuleKey | string; ruleLabel: string; area: string; severity: Severity; status: AlertStatus; statusLabel: string; title: string;
  subject: string | null; firstSeenAt: Date; lastSeenAt: Date; seenCount: number; href: string | null;
};

export type IntegrityOverview = {
  rows: AlertRow[];
  counts: { new: number; reviewing: number; high: number; total: number };
  byRule: { rule: string; label: string; open: number }[];
  lastScan: Date | null;
  filter: { status: string; severity: string; rule: string };
};

export async function getIntegrityOverview(input: { status?: string; severity?: string; rule?: string } = {}): Promise<IntegrityOverview> {
  const r = await integrityReviewer('getIntegrityOverview');
  const status = input.status === 'all' ? 'all' : asAlertStatus(input.status) ?? 'open';
  const severity = (SEVERITIES as readonly string[]).includes(String(input.severity)) ? String(input.severity) : 'all';
  const rule = (RULE_KEYS as string[]).includes(String(input.rule)) ? String(input.rule) : 'all';
  const where: Prisma.IntegrityAlertWhereInput = {
    AND: [
      visible(r),
      status === 'open' ? { status: { in: ['NEW', 'REVIEWING'] } } : status === 'all' ? {} : { status },
      severity === 'all' ? {} : { severity },
      rule === 'all' ? {} : { rule },
    ],
  };
  const [rows, newCount, reviewing, high, total, grouped, lastScan] = await Promise.all([
    prisma.integrityAlert.findMany({ where, orderBy: [{ lastSeenAt: 'desc' }], take: 200 }),
    prisma.integrityAlert.count({ where: { AND: [visible(r), { status: 'NEW' }] } }),
    prisma.integrityAlert.count({ where: { AND: [visible(r), { status: 'REVIEWING' }] } }),
    prisma.integrityAlert.count({ where: { AND: [visible(r), { status: { in: ['NEW', 'REVIEWING'] }, severity: 'HIGH' }] } }),
    prisma.integrityAlert.count({ where: visible(r) }),
    prisma.integrityAlert.groupBy({ by: ['rule'], where: { AND: [visible(r), { status: { in: ['NEW', 'REVIEWING'] } }] }, _count: { _all: true } }),
    prisma.auditLog.findFirst({ where: { organisationId: r.organisationId, action: 'integrity.scan' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const subjects = [...new Set(rows.map((x) => x.subjectUserId).filter((x): x is string => Boolean(x)))];
  const names = new Map((subjects.length ? await prisma.user.findMany({ where: { id: { in: subjects }, organisationId: r.organisationId }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
  const sorted = [...rows].sort((a, b) => (a.status === 'NEW' ? 0 : 1) - (b.status === 'NEW' ? 0 : 1) || SEVERITY_RANK[asSeverity(a.severity)] - SEVERITY_RANK[asSeverity(b.severity)] || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  return {
    rows: sorted.map((a) => toRow(a, names)),
    counts: { new: newCount, reviewing, high, total },
    byRule: grouped.map((g) => ({ rule: g.rule, label: RULES[g.rule as RuleKey]?.label ?? g.rule, open: g._count._all })).sort((a, b) => b.open - a.open),
    lastScan: lastScan?.createdAt ?? null,
    filter: { status, severity, rule },
  };
}

type AlertRecord = { id: string; rule: string; severity: string; status: string; title: string; subjectUserId: string | null; firstSeenAt: Date; lastSeenAt: Date; seenCount: number; entityType: string | null; entityId: string | null };

function toRow(a: AlertRecord, names: Map<string, string>): AlertRow {
  const info = RULES[a.rule as RuleKey];
  const status = asAlertStatus(a.status) ?? 'NEW';
  return {
    id: a.id, rule: a.rule, ruleLabel: info?.label ?? a.rule, area: info?.area ?? 'Other', severity: asSeverity(a.severity), status, statusLabel: ALERT_STATUS_LABEL[status], title: a.title,
    subject: a.subjectUserId ? names.get(a.subjectUserId) ?? 'A colleague' : null, firstSeenAt: a.firstSeenAt, lastSeenAt: a.lastSeenAt, seenCount: a.seenCount,
    href: a.entityType && a.entityId && a.entityType !== 'IntegrityAlert' ? recordUrl(a.entityType, a.entityId) : null,
  };
}

export type AlertDetail = AlertRow & {
  why: string; evidence: Record<string, unknown>; resolution: string | null; reviewedBy: string | null; reviewedAt: Date | null; reportedBy: string | null;
  history: { action: string; at: Date; by: string | null; status: string | null }[];
};

export async function getIntegrityAlert(id: string): Promise<AlertDetail> {
  const r = await integrityReviewer('getIntegrityAlert');
  const a = typeof id === 'string' && id ? await prisma.integrityAlert.findFirst({ where: { AND: [{ id }, visible(r)] } }) : null;
  if (!a) throw new IntegrityError(NOT_AVAILABLE);
  const people = [a.subjectUserId, a.reviewedById, a.reportedById].filter((x): x is string => Boolean(x));
  const names = new Map((people.length ? await prisma.user.findMany({ where: { id: { in: people }, organisationId: r.organisationId }, select: { id: true, fullName: true } }) : []).map((u) => [u.id, u.fullName]));
  const history = await prisma.auditLog.findMany({ where: { organisationId: r.organisationId, entityType: 'IntegrityAlert', entityId: a.id }, orderBy: { createdAt: 'asc' }, take: 50, select: { action: true, createdAt: true, userId: true, metadata: true } });
  const actors = [...new Set(history.map((h) => h.userId).filter((x): x is string => Boolean(x)))];
  for (const u of actors.length ? await prisma.user.findMany({ where: { id: { in: actors } }, select: { id: true, fullName: true } }) : []) names.set(u.id, u.fullName);
  return {
    ...toRow(a, names),
    why: RULES[a.rule as RuleKey]?.why ?? '',
    evidence: a.evidence && typeof a.evidence === 'object' && !Array.isArray(a.evidence) ? (a.evidence as Record<string, unknown>) : {},
    resolution: a.resolution, reviewedBy: a.reviewedById ? names.get(a.reviewedById) ?? 'A reviewer' : null, reviewedAt: a.reviewedAt,
    reportedBy: a.rule === 'speak_up' ? (a.reportedById ? names.get(a.reportedById) ?? 'A colleague' : 'Anonymous') : null,
    history: history.map((h) => ({ action: h.action, at: h.createdAt, by: h.userId ? names.get(h.userId) ?? 'A reviewer' : h.action === 'integrity.speak_up' ? 'Anonymous' : 'The checks', status: h.metadata && typeof h.metadata === 'object' && typeof (h.metadata as { status?: unknown }).status === 'string' ? String((h.metadata as { status: string }).status) : null })),
  };
}

/** Decide an alert: being looked at, confirmed (action taken) or dismissed (nothing wrong) — with what was found. */
export async function reviewIntegrityAlert(input: { id?: string; status?: string; resolution?: string }): Promise<void> {
  const r = await integrityReviewer('reviewIntegrityAlert');
  const status = asAlertStatus(input.status);
  if (!status || status === 'NEW') throw new IntegrityError('Choose what happens to this alert.');
  const resolution = String(input.resolution ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if ((status === 'CONFIRMED' || status === 'DISMISSED') && resolution.length < 10) throw new IntegrityError('Write what you found and did (at least a sentence).');
  const a = typeof input.id === 'string' && input.id ? await prisma.integrityAlert.findFirst({ where: { AND: [{ id: input.id }, visible(r)] }, select: { id: true, status: true, subjectUserId: true, rule: true } }) : null;
  if (!a) throw new IntegrityError(NOT_AVAILABLE);
  // Belt and braces: never about yourself (visible() already hides them).
  if (a.subjectUserId === r.id) throw new IntegrityError('Another reviewer must decide an alert about you.');
  // Compare-and-set on the status read above: two reviewers never overwrite each other.
  const done = await prisma.integrityAlert.updateMany({
    where: { id: a.id, status: a.status },
    data: { status, resolution: resolution || null, reviewedById: r.id, reviewedAt: new Date(), ...(status === 'REVIEWING' ? { assignedToId: r.id } : {}) },
  });
  if (!done.count) throw new IntegrityError('Someone else changed this alert just now. Refresh and look again.');
  await prisma.auditLog.create({ data: { organisationId: r.organisationId, userId: r.id, action: 'integrity.alert_reviewed', entityType: 'IntegrityAlert', entityId: a.id, metadata: { rule: a.rule, from: a.status, status } } });
}

/** Run the checks now (at most every 10 minutes per reviewer). */
export async function runIntegrityScanNow(): Promise<ScanResult> {
  const r = await integrityReviewer('runIntegrityScanNow');
  if (!withinLimit(`integrity-scan:${r.organisationId}`, 1, 10 * 60_000)) throw new IntegrityError('The checks ran a few minutes ago. Try again in 10 minutes.');
  const res = await scanOrganisation(r.organisationId);
  await prisma.auditLog.create({ data: { organisationId: r.organisationId, userId: r.id, action: 'integrity.scan', entityType: 'IntegrityAlert', metadata: { findings: res.findings, created: res.created, ms: res.ms } } });
  return res;
}

/** How many open alerts a reviewer has (for the dashboard and the menu); 0 for everyone else. */
export async function countOpenIntegrityAlerts(): Promise<{ open: number; high: number }> {
  const me = await requireUser();
  if (!(await allows(PERM).catch(() => false))) return { open: 0, high: 0 };
  const organisationId = await myOrganisationId();
  if (!organisationId) return { open: 0, high: 0 };
  const w = visible({ id: me.id, organisationId });
  const [open, high] = await Promise.all([
    prisma.integrityAlert.count({ where: { AND: [w, { status: 'NEW' }] } }),
    prisma.integrityAlert.count({ where: { AND: [w, { status: 'NEW', severity: 'HIGH' }] } }),
  ]);
  return { open, high };
}

/**
 * Speak up: any colleague raises a concern for the reviewers. Never shown to
 * the person it may be about. Anonymous when they choose — then nothing
 * records who raised it (no reporter on the alert, no person on the audit
 * entry, and the data journal does not record alerts).
 */
export async function speakUp(input: { title?: string; details?: string; anonymous?: boolean | string; aboutUserId?: string }): Promise<void> {
  await refuseDuringAssist('speakUp');
  const me = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new IntegrityError('Your account is not placed in an organisation yet.');
  if (!withinLimit(`speak-up:${me.id}`, 5, 24 * 3_600_000)) throw new IntegrityError('You have raised 5 concerns today. Please wait for a reviewer, or speak to an administrator directly.');
  const title = String(input.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const details = String(input.details ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 4000);
  if (title.length < 5) throw new IntegrityError('Say in a few words what the concern is.');
  if (details.length < 20) throw new IntegrityError('Describe what you saw: what, when, where, and any record numbers.');
  const anonymous = input.anonymous === true || input.anonymous === 'on' || input.anonymous === '1';
  const about = typeof input.aboutUserId === 'string' && input.aboutUserId
    ? await prisma.user.findFirst({ where: { id: input.aboutUserId, organisationId }, select: { id: true } })
    : null;
  const alert = await prisma.integrityAlert.create({
    data: {
      organisationId, rule: 'speak_up', severity: 'MEDIUM', title, evidence: { details }, subjectUserId: about?.id ?? null,
      reportedById: anonymous ? null : me.id, fingerprint: `speak-up:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({ data: { organisationId, userId: anonymous ? null : me.id, action: 'integrity.speak_up', entityType: 'IntegrityAlert', entityId: alert.id, metadata: { anonymous } } });
}

/** Colleagues to name in a Speak up report (active, same organisation). */
export async function listColleaguesForSpeakUp(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) return [];
  const rows = await prisma.user.findMany({ where: { organisationId, isActive: true }, orderBy: { fullName: 'asc' }, take: 1000, select: { id: true, fullName: true } });
  return rows.map((u) => ({ id: u.id, name: u.fullName }));
}
