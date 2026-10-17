'use server';

import { prisma } from '@ejo/database';
import { getPrincipal, myOrganisationId, refuse } from '@/lib/authz/server';
import { scopeFor } from '@/lib/authz/catalogue';
import { dayLabel, lastDays, perDay, summariseVisits, trendOf, type WebsiteReport } from '@/lib/it-trends-core';

/**
 * IT's trends and the public website's visitor report. For organisation-wide
 * IT (audit trail for every branch) and, for the website report only,
 * leadership with organisation-wide Business analytics. Counts only — no
 * names, messages, addresses or recipients.
 */
export type ItTrends = {
  days: { day: string; label: string; errors: number; signIns: number; failedSignIns: number; chats: number; chatsStaff: number; chatsWebsite: number; emailsSent: number | null; emailsFailed: number | null; jobRuns: number }[];
  trend: { errors: ReturnType<typeof trendOf>; signIns: ReturnType<typeof trendOf>; chats: ReturnType<typeof trendOf> };
  emailsShown: boolean;
};

async function canSee(kind: 'it' | 'website', where: string): Promise<void> {
  const me = await getPrincipal();
  const it = me.isSuperAdmin || scopeFor(me, 'audit.view') === 'ALL';
  const leaders = kind === 'website' && scopeFor(me, 'analytics.business.view') === 'ALL';
  if (!it && !leaders) await refuse('audit.view', where, kind === 'it' ? 'IT trends are for organisation-wide IT and administrators.' : 'The website report is for IT and leadership.');
}

export async function getItTrends(n = 14): Promise<ItTrends> {
  await canSee('it', 'getItTrends');
  const me = await getPrincipal();
  const org = (await myOrganisationId()) ?? '__none__';
  const days = lastDays(Math.min(Math.max(n, 7), 30));
  const since = new Date(Date.parse(`${days[0]}T00:00:00+01:00`));
  // Email and job logs are kept for the whole installation: shown when it serves one organisation (or to the master admin).
  const orgs = await prisma.organisation.count();
  const emailsShown = me.isSuperAdmin || orgs <= 1;
  const [errors, ins, fails, chats, mails, runs] = await Promise.all([
    prisma.errorEvent.findMany({ where: { organisationId: org, createdAt: { gte: since } }, select: { createdAt: true }, take: 50_000 }),
    prisma.auditLog.findMany({ where: { organisationId: org, action: 'user.signed_in', createdAt: { gte: since } }, select: { createdAt: true }, take: 50_000 }),
    prisma.auditLog.findMany({ where: { organisationId: org, action: 'user.sign_in_failed', createdAt: { gte: since } }, select: { createdAt: true }, take: 50_000 }),
    prisma.enyoConversation.findMany({ where: { organisationId: org, createdAt: { gte: since } }, select: { createdAt: true, channel: true }, take: 50_000 }),
    emailsShown ? prisma.securityEmailLog.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, sent: true }, take: 50_000 }) : Promise.resolve([]),
    emailsShown ? prisma.auditLog.findMany({ where: { action: 'system.job_run', createdAt: { gte: since } }, select: { createdAt: true }, take: 50_000 }) : Promise.resolve([]),
  ]);
  const e = perDay(errors.map((x) => x.createdAt), days);
  const s = perDay(ins.map((x) => x.createdAt), days);
  const f = perDay(fails.map((x) => x.createdAt), days);
  const c = perDay(chats.map((x) => x.createdAt), days);
  const cs = perDay(chats.filter((x) => x.channel === 'STAFF').map((x) => x.createdAt), days);
  const ok = perDay(mails.filter((x) => x.sent).map((x) => x.createdAt), days);
  const bad = perDay(mails.filter((x) => !x.sent).map((x) => x.createdAt), days);
  const j = perDay(runs.map((x) => x.createdAt), days);
  return {
    days: days.map((day, i) => ({
      day, label: dayLabel(day), errors: e[i]!, signIns: s[i]!, failedSignIns: f[i]!, chats: c[i]!, chatsStaff: cs[i]!, chatsWebsite: c[i]! - cs[i]!,
      emailsSent: emailsShown ? ok[i]! : null, emailsFailed: emailsShown ? bad[i]! : null, jobRuns: j[i]!,
    })),
    trend: { errors: trendOf(e), signIns: trendOf(s), chats: trendOf(c) },
    emailsShown,
  };
}

/** The website report for the last `n` days; null when the database does not have the visitor table yet (v40). */
export async function getWebsiteTraffic(n = 14): Promise<(WebsiteReport & { since: string }) | null> {
  await canSee('website', 'getWebsiteTraffic');
  const org = (await myOrganisationId()) ?? '__none__';
  const days = lastDays(Math.min(Math.max(n, 1), 90));
  const rows = await prisma.siteVisit.findMany({
    where: { organisationId: org, day: { gte: new Date(`${days[0]}T00:00:00Z`) } },
    select: { day: true, visitorHash: true, sessionId: true, path: true, durationSec: true, chatted: true, device: true, referrerHost: true },
    take: 200_000,
  }).catch(() => null);
  if (!rows) return null;
  return { ...summariseVisits(rows, days), since: days[0]! };
}
