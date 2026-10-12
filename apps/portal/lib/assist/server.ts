import { cache } from 'react';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { prisma, setAuditActor } from '@ejo/database';
import { auth } from '@/lib/auth';
import { PERMISSIONS, ROLE_LABELS, type PermissionKey, type Scope } from '@/lib/authz/catalogue';
import { assistRefusal, assistSummary, type AssistParty, type AssistRefusal } from './rules';
import { ASSIST_COOKIE, signedAssistId, verifyAssistToken } from './token';
import { writeAuditLog } from '@/lib/workshop-core';
import { sendLoggedEmail } from '@/lib/logged-email';

/**
 * Assisted sessions on the server: who is really signed in, whether they are
 * working on a colleague's behalf right now, and ending a session. Server-only
 * (not a 'use server' file), so nothing here is callable from a browser.
 *
 * Nothing in the lookup path writes to the database: the audit journal asks
 * "who is acting?" through this code, so a write here would wait on itself.
 * Sessions found expired or no longer allowed are ended after the response.
 */

/** Better Auth's session for this request (the person who typed their own password). */
export const signedInSession = cache(async () => auth.api.getSession({ headers: await headers() }));

const PARTY_SELECT = {
  id: true, fullName: true, email: true, isActive: true, organisationId: true, branchId: true, departmentId: true,
  roles: { select: { role: { select: { slug: true, name: true, isSuperAdmin: true, permissions: { select: { permission: { select: { key: true } } } } } } } },
} as const;

type PartyRow = {
  id: string; fullName: string; email: string; isActive: boolean; organisationId: string | null; branchId: string | null; departmentId: string | null;
  roles: { role: { slug: string; name: string; isSuperAdmin: boolean; permissions: { permission: { key: string } }[] } }[];
};

export function toParty(u: PartyRow): AssistParty {
  const extra: Partial<Record<PermissionKey, Scope>> = {};
  for (const r of u.roles) for (const rp of r.role.permissions) if (rp.permission.key in PERMISSIONS) extra[rp.permission.key as PermissionKey] = 'BRANCH';
  return {
    userId: u.id,
    isActive: u.isActive,
    isSuperAdmin: u.roles.some((r) => r.role.isSuperAdmin),
    organisationId: u.organisationId,
    branchId: u.branchId,
    departmentId: u.departmentId,
    roleSlugs: u.roles.map((r) => r.role.slug),
    extraGrants: extra,
  };
}

/** "Technician", "Front Desk (Receptionist)" … for the banner and lists. */
export function roleLabelOf(u: { roles: { role: { slug: string; name: string; isSuperAdmin: boolean } }[] }): string {
  const names = u.roles.filter((r) => !r.role.isSuperAdmin).map((r) => ROLE_LABELS[r.role.slug] ?? r.role.name);
  return names.length ? names.join(', ') : 'No role';
}

export async function loadParty(userId: string): Promise<(PartyRow & { party: AssistParty }) | null> {
  const u = (await prisma.user.findUnique({ where: { id: userId }, select: PARTY_SELECT })) as PartyRow | null;
  return u ? { ...u, party: toParty(u) } : null;
}

/** Whether the assistant may help this colleague (both loaded fresh). */
export async function refusalFor(assistantId: string, colleagueId: string): Promise<AssistRefusal | null> {
  const [a, c] = await Promise.all([loadParty(assistantId), loadParty(colleagueId)]);
  if (!a) return { code: 'ASSISTANT_INACTIVE', message: 'Your account could not be found.' };
  if (!c) return { code: 'OUT_OF_REACH', message: 'This colleague is not someone you can assist.' };
  return assistRefusal(a.party, c.party);
}

export type ActiveAssist = {
  sessionId: string;
  organisationId: string;
  branchId: string | null;
  startedAt: Date;
  expiresAt: Date;
  assistant: { id: string; name: string };
  subject: { id: string; name: string; email: string; roleLabel: string; organisationId: string | null };
};

const SECRET = () => process.env.BETTER_AUTH_SECRET ?? '';

function refusalReason(r: AssistRefusal): string {
  if (r.code === 'COLLEAGUE_INACTIVE') return 'colleague_switched_off';
  if (r.code === 'SENSITIVE' || r.code === 'OUT_OF_REACH') return 'no_longer_assistable';
  return 'assistant_not_allowed';
}

/** Ends the session once the current response has been sent. */
function endLater(id: string, reason: string): void {
  const run = () => endAssistSessionRecord(id, reason).catch(() => undefined);
  try { after(run); } catch { void run(); }
}

/**
 * The assisted session this signed-in person is running in this browser, or
 * null. Valid only when the cookie is genuine and bound to this sign-in, the
 * session is theirs, not ended, not expired, in their organisation, and the
 * colleague can still be assisted (checked again on every request).
 */
export const activeAssistFor = cache(async (userId: string, authSessionId: string): Promise<ActiveAssist | null> => {
  const raw = (await cookies()).get(ASSIST_COOKIE)?.value;
  if (!raw) return null;
  const id = verifyAssistToken(raw, authSessionId, SECRET());
  if (!id) {
    // Our own cookie from an earlier sign-in of this assistant: they signed out, so the session ends.
    const stale = signedAssistId(raw, SECRET());
    if (stale) {
      const s = await prisma.assistSession.findUnique({ where: { id: stale }, select: { assistantId: true, endedAt: true } });
      if (s && s.assistantId === userId && !s.endedAt) endLater(stale, 'assistant_signed_out');
    }
    return null;
  }
  const s = await prisma.assistSession.findUnique({
    where: { id },
    select: { id: true, organisationId: true, branchId: true, assistantId: true, subjectId: true, startedAt: true, expiresAt: true, endedAt: true, assistant: { select: PARTY_SELECT }, subject: { select: PARTY_SELECT } },
  });
  if (!s || s.assistantId !== userId || s.endedAt) return null;
  if (s.expiresAt.getTime() <= Date.now()) {
    endLater(s.id, 'expired');
    return null;
  }
  const assistant = s.assistant as PartyRow;
  const subject = s.subject as PartyRow;
  if (assistant.organisationId !== s.organisationId || subject.organisationId !== s.organisationId) {
    endLater(s.id, 'no_longer_assistable');
    return null;
  }
  const refusal = assistRefusal(toParty(assistant), toParty(subject));
  if (refusal) {
    endLater(s.id, refusalReason(refusal));
    return null;
  }
  return {
    sessionId: s.id,
    organisationId: s.organisationId,
    branchId: s.branchId,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
    assistant: { id: assistant.id, name: assistant.fullName },
    subject: { id: subject.id, name: subject.fullName, email: subject.email, roleLabel: roleLabelOf(subject), organisationId: subject.organisationId },
  };
});

/**
 * Sessions nobody ended (time ran out, or someone's account was switched off
 * while the assistant was away) are closed after the response, at most once a
 * minute per organisation on each server, so the colleague is still told.
 */
const lastSweep = new Map<string, number>();
function sweepLater(organisationId: string | null): void {
  if (!organisationId) return;
  const now = Date.now();
  if (now - (lastSweep.get(organisationId) ?? 0) < 60_000) return;
  lastSweep.set(organisationId, now);
  if (lastSweep.size > 1000) lastSweep.clear();
  const run = async () => {
    const stale = await prisma.assistSession.findMany({
      where: { organisationId, endedAt: null, OR: [{ expiresAt: { lte: new Date() } }, { subject: { isActive: false } }, { assistant: { isActive: false } }] },
      select: { id: true, expiresAt: true, subject: { select: { isActive: true } } },
      take: 50,
    });
    for (const s of stale) await endAssistSessionRecord(s.id, s.expiresAt.getTime() <= Date.now() ? 'expired' : !s.subject.isActive ? 'colleague_switched_off' : 'assistant_not_allowed');
  };
  try { after(() => run().catch(() => undefined)); } catch { /* outside a request: nothing to do */ }
}

/** The signed-in person (never the colleague) and, when running one, their assisted session. */
export const signedInContext = cache(async (): Promise<{ userId: string; authSessionId: string; organisationId: string | null; assist: ActiveAssist | null } | null> => {
  const session = await signedInSession();
  if (!session?.user?.id) return null;
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isActive: true, organisationId: true } });
  if (!u?.isActive) return null;
  sweepLater(u.organisationId);
  const assist = await activeAssistFor(session.user.id, session.session.id);
  return { userId: session.user.id, authSessionId: session.session.id, organisationId: u.organisationId, assist };
});

/** Actions recorded on the colleague's behalf during a session (business entries, not the low-level journal). */
export async function actionsRecorded(sessionId: string): Promise<number> {
  return prisma.auditLog.count({
    where: { metadata: { path: ['assistSessionId'], equals: sessionId }, NOT: [{ entityType: { startsWith: 'db:' } }, { action: { startsWith: 'assist.' } }, { action: 'access.denied' }] },
  });
}

const lagosTime = (d: Date) => new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }).format(d);

/**
 * Marks a session ended (once — a second call does nothing), records it in
 * the audit trail, and tells the colleague what was done for them.
 */
export async function endAssistSessionRecord(id: string, reason: string): Promise<boolean> {
  const now = new Date();
  const s = await prisma.assistSession.findUnique({ where: { id }, select: { id: true, organisationId: true, branchId: true, startedAt: true, expiresAt: true, endedAt: true, reason: true, assistant: { select: { id: true, fullName: true } }, subject: { select: { id: true, fullName: true, email: true, isActive: true } } } });
  if (!s || s.endedAt) return false;
  // Recorded as the assistant's own step, without asking the request who is
  // acting (this also runs after the response, where the request is gone).
  setAuditActor(s.assistant.id, 'portal', s.organisationId);
  // Expired sessions end at their expiry time, not whenever someone noticed.
  const endedAt = reason === 'expired' && s.expiresAt < now ? s.expiresAt : now;
  const { count } = await prisma.assistSession.updateMany({ where: { id, endedAt: null }, data: { endedAt, endedReason: reason } });
  if (count !== 1) return false;
  const actions = await actionsRecorded(id);
  const summary = assistSummary(s.assistant.fullName, lagosTime(s.startedAt), lagosTime(endedAt), actions);
  await writeAuditLog({
    userId: s.assistant.id,
    organisationId: s.organisationId,
    action: 'assist.ended',
    entityType: 'AssistSession',
    entityId: s.id,
    metadata: { colleagueId: s.subject.id, colleague: s.subject.fullName, assistant: s.assistant.fullName, reason, actions, summary, minutes: Math.max(0, Math.round((+endedAt - +s.startedAt) / 60000)) },
  });
  if (s.subject.isActive && s.subject.email) {
    await sendLoggedEmail({
      entityType: 'AssistSession',
      entityId: s.id,
      recipients: [{ fullName: s.subject.fullName, email: s.subject.email }],
      subject: `${s.assistant.fullName} helped you with your work`,
      heading: 'Your assisted session has ended',
      lines: [summary, 'Everything done in the session is recorded under your name, with the assistant named beside it. If something looks wrong, tell your branch administrator.', 'You can see the sessions held for you on your Profile page.'],
      path: '/profile',
      actorId: s.assistant.id,
      branchId: s.branchId,
    }).catch(() => undefined);
  }
  return true;
}
