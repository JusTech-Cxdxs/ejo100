'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { auth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorizeAsSignedIn, getSignedInPrincipal, inMyOrganisation, refuseDuringAssist } from '@/lib/authz/server';
import { scopeFor } from '@/lib/authz/catalogue';
import { endAssistSessionRecord, loadParty, roleLabelOf, signedInContext, toParty } from '@/lib/assist/server';
import { ASSIST_ATTEMPT_WINDOW_MS, ASSIST_MAX_FAILED_ATTEMPTS, END_REASON_LABEL, assistMinutes, assistRefusal, minutesBetween } from '@/lib/assist/rules';
import { ASSIST_COOKIE, signAssistToken } from '@/lib/assist/token';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * Assisted sessions: a Branch Assistant works on a colleague's behalf, with
 * the colleague's own password typed as consent. While it lasts, every rule
 * runs as the colleague and every audit entry names both people
 * (lib/assist/server.ts, requireUser, getPrincipal).
 */

export type AssistableColleague = { id: string; name: string; employeeId: string | null; roleLabel: string; department: string | null };

const NOT_ASSISTANT = 'Only a Branch Assistant can help colleagues this way.';

/** Colleagues this assistant may help right now (same organisation and branch, nothing sensitive in their access). */
export async function searchAssistableColleagues(q = ''): Promise<AssistableColleague[]> {
  const p = await authorizeAsSignedIn('support.assist', undefined, 'assist.search', NOT_ASSISTANT);
  if (!p.organisationId) return [];
  const term = q.trim().slice(0, 80);
  const branchOnly = scopeFor(p, 'support.assist') !== 'ALL';
  if (branchOnly && !p.branchId) return [];
  const rows = await prisma.user.findMany({
    where: {
      organisationId: p.organisationId,
      ...(branchOnly ? { branchId: p.branchId } : {}),
      isActive: true,
      id: { not: p.userId },
      roles: { none: { role: { isSuperAdmin: true } } },
      ...(term ? { OR: [{ fullName: { contains: term, mode: 'insensitive' as const } }, { employeeId: { contains: term, mode: 'insensitive' as const } }, { email: { contains: term, mode: 'insensitive' as const } }] } : {}),
    },
    orderBy: { fullName: 'asc' },
    take: 200,
    select: {
      id: true, fullName: true, email: true, employeeId: true, isActive: true, organisationId: true, branchId: true, departmentId: true, department: { select: { name: true } },
      roles: { select: { role: { select: { slug: true, name: true, isSuperAdmin: true, permissions: { select: { permission: { select: { key: true } } } } } } } },
    },
  });
  const me = await loadParty(p.userId);
  if (!me) return [];
  return rows
    .filter((u: (typeof rows)[number]) => assistRefusal(me.party, toParty(u)) === null)
    .slice(0, 50)
    .map((u: (typeof rows)[number]) => ({ id: u.id, name: u.fullName, employeeId: u.employeeId, roleLabel: roleLabelOf(u), department: u.department?.name ?? null }));
}

export type StartAssistResult = { ok: true } | { ok: false; error: string };

/**
 * Starts an assisted session once the colleague has typed their own password.
 * Wrong passwords are counted (five per 15 minutes per assistant and
 * colleague) and recorded; the password itself is never stored or logged.
 */
export async function startAssistSession(input: { colleagueId: string; password: string; reason?: string }): Promise<StartAssistResult> {
  const ctx = await signedInContext();
  if (!ctx) throw new Error('Not authenticated.');
  if (ctx.assist) return { ok: false, error: `You are already helping ${ctx.assist.subject.name}. End that session first.` };
  const p = await authorizeAsSignedIn('support.assist', undefined, 'assist.start', NOT_ASSISTANT);
  const colleagueId = typeof input?.colleagueId === 'string' ? input.colleagueId.slice(0, 64) : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  const reason = typeof input?.reason === 'string' ? input.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!colleagueId) return { ok: false, error: 'Choose the colleague you are helping.' };

  const [me, colleague] = await Promise.all([loadParty(p.userId), loadParty(colleagueId)]);
  // Another organisation's person is treated exactly like one who does not exist.
  if (!me || !colleague || !(await inMyOrganisation(colleague.organisationId))) {
    await writeAuditLog({ userId: p.userId, action: 'access.denied', entityType: 'Access', entityId: 'assist.start', metadata: { permission: 'support.assist', reason: 'Colleague outside the organisation or not found' } });
    return { ok: false, error: 'This colleague is not someone you can assist.' };
  }
  const refusal = assistRefusal(me.party, colleague.party);
  if (refusal) {
    await writeAuditLog({ userId: p.userId, action: 'assist.refused', entityType: 'User', entityId: colleague.id, metadata: { colleague: colleague.fullName, reason: refusal.message } });
    return { ok: false, error: refusal.message };
  }
  if (!password) return { ok: false, error: `Ask ${colleague.fullName} to type their password.` };

  // Count, check and record the attempt under one lock per assistant, so
  // parallel submissions cannot each see "under the limit" (5 tries per
  // colleague, 15 in all, per 15 minutes). A failed try is written inside the
  // same transaction; if that write fails, the try is refused.
  const since = new Date(Date.now() - ASSIST_ATTEMPT_WINDOW_MS);
  const account = await prisma.account.findFirst({ where: { userId: colleague.id, providerId: 'credential' }, select: { password: true } });
  const authCtx = await auth.$context;
  type Attempt = { kind: 'blocked' } | { kind: 'wrong'; failures: number } | { kind: 'ok' };
  let attempt: Attempt;
  try {
    attempt = await prisma.$transaction(async (tx) => {
      // The lock function returns void, which Prisma can't read back: select a plain 1 instead.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`assist-consent:${p.userId}`}))`;
      const [failures, allFailures] = await Promise.all([
        tx.auditLog.count({ where: { userId: p.userId, action: 'assist.consent_failed', entityType: 'User', entityId: colleague.id, createdAt: { gte: since } } }),
        tx.auditLog.count({ where: { userId: p.userId, action: 'assist.consent_failed', createdAt: { gte: since } } }),
      ]);
      if (failures >= ASSIST_MAX_FAILED_ATTEMPTS || allFailures >= ASSIST_MAX_FAILED_ATTEMPTS * 3) return { kind: 'blocked' } as const;
      // Better Auth's own password check; over-long input is refused before hashing.
      let valid = false;
      if (account?.password && password.length <= 256) {
        try {
          valid = await authCtx.password.verify({ hash: account.password, password });
        } catch {
          valid = false;
        }
      }
      if (valid) return { kind: 'ok' } as const;
      await tx.auditLog.create({ data: { userId: p.userId, organisationId: me.organisationId, action: 'assist.consent_failed', entityType: 'User', entityId: colleague.id, metadata: { colleague: colleague.fullName, attempt: failures + 1 } } });
      return { kind: 'wrong', failures: failures + 1 } as const;
    }, { timeout: 15_000 });
  } catch {
    return { ok: false, error: 'We could not check the password just now. Please try again in a moment.' };
  }
  if (attempt.kind === 'blocked') {
    return { ok: false, error: 'Too many wrong passwords for this colleague. Wait 15 minutes, or ask them to reset their password with an administrator.' };
  }
  if (attempt.kind === 'wrong') {
    const left = ASSIST_MAX_FAILED_ATTEMPTS - attempt.failures;
    return { ok: false, error: left > 0 ? `That password is not right. ${colleague.fullName} can try again (${pluralize(left, 'try', 'tries')} left).` : 'That password is not right. No tries left for 15 minutes.' };
  }

  // One session at a time per assistant: one left open in another browser ends now.
  const open = await prisma.assistSession.findMany({ where: { assistantId: p.userId, endedAt: null }, select: { id: true } });
  for (const o of open) await endAssistSessionRecord(o.id, 'replaced');

  const minutes = assistMinutes(process.env.ASSIST_SESSION_MINUTES);
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const h = await headers();
  const session = await prisma.assistSession.create({
    data: {
      organisationId: me.organisationId!,
      assistantId: me.id,
      subjectId: colleague.id,
      branchId: colleague.branchId,
      reason: reason || null,
      consentMethod: 'password',
      expiresAt,
      ipAddress: (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim().slice(0, 64) || null,
      userAgent: (h.get('user-agent') ?? '').slice(0, 300) || null,
    },
    select: { id: true },
  });
  (await cookies()).set(ASSIST_COOKIE, signAssistToken(session.id, ctx.authSessionId, process.env.BETTER_AUTH_SECRET ?? ''), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
  await writeAuditLog({
    userId: me.id,
    organisationId: me.organisationId,
    action: 'assist.started',
    entityType: 'AssistSession',
    entityId: session.id,
    metadata: { colleagueId: colleague.id, colleague: colleague.fullName, assistant: me.fullName, reason: reason || null, minutes },
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Ends the assisted session running in this browser. Always possible for
 * the assistant (whatever their access is by now); only ever their own session.
 */
export async function endAssistSession(): Promise<void> {
  const ctx = await signedInContext();
  const jar = await cookies();
  if (ctx?.assist && ctx.assist.assistant.id === ctx.userId) {
    await endAssistSessionRecord(ctx.assist.sessionId, 'ended_by_assistant');
    revalidatePath('/', 'layout');
  }
  if (jar.has(ASSIST_COOKIE)) jar.set(ASSIST_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
}

export type AssistSessionRow = {
  id: string;
  assistant: string;
  colleague: string;
  colleagueRole: string;
  startedAt: Date;
  endedAt: Date | null;
  live: boolean;
  minutes: number;
  reason: string | null;
  ended: string | null;
  actions: number;
};

async function rowsFor(where: Record<string, unknown>): Promise<AssistSessionRow[]> {
  const list = await prisma.assistSession.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: 100,
    select: {
      id: true, startedAt: true, expiresAt: true, endedAt: true, endedReason: true, reason: true, subjectId: true,
      assistant: { select: { fullName: true } },
      subject: { select: { fullName: true, roles: { select: { role: { select: { slug: true, name: true, isSuperAdmin: true } } } } } },
    },
  });
  if (list.length === 0) return [];
  const ids = list.map((s: { id: string }) => s.id);
  const subjects = [...new Set(list.map((s: { subjectId: string }) => s.subjectId))];
  const since = list[list.length - 1]!.startedAt;
  const counts = await prisma.$queryRaw<{ id: string; n: bigint }[]>`
    SELECT metadata->>'assistSessionId' AS id, COUNT(*)::bigint AS n
    FROM audit_logs
    WHERE "userId" = ANY(${subjects}) AND "createdAt" >= ${since}
      AND metadata->>'assistSessionId' = ANY(${ids})
      AND "entityType" NOT LIKE 'db:%' AND action NOT LIKE 'assist.%' AND action <> 'access.denied'
    GROUP BY 1`;
  const n = new Map(counts.map((c: { id: string; n: bigint }) => [c.id, Number(c.n)]));
  const now = new Date();
  return list.map((s: (typeof list)[number]) => {
    // A session nobody ended before its time ran out still ended then.
    const endedAt = s.endedAt ?? (s.expiresAt <= now ? s.expiresAt : null);
    const ended = s.endedAt ? END_REASON_LABEL[s.endedReason ?? ''] ?? 'Ended' : endedAt ? END_REASON_LABEL.expired! : null;
    return {
      id: s.id,
      assistant: s.assistant.fullName,
      colleague: s.subject.fullName,
      colleagueRole: roleLabelOf(s.subject),
      startedAt: s.startedAt,
      endedAt,
      live: !endedAt,
      minutes: minutesBetween(s.startedAt, endedAt ?? now),
      reason: s.reason,
      ended,
      actions: n.get(s.id) ?? 0,
    };
  });
}

/**
 * The assisted-sessions history the signed-in person may see: administrators
 * their organisation's (branch administrators their branch's), an assistant
 * their own sessions.
 */
export async function listAssistSessionHistory(): Promise<{ title: string; rows: AssistSessionRow[] }> {
  const p = await getSignedInPrincipal();
  if (!p.organisationId && !p.isSuperAdmin) return { title: 'Assisted sessions', rows: [] };
  const org = p.isSuperAdmin ? {} : { organisationId: p.organisationId! };
  const admin = scopeFor(p, 'admin.users.manage');
  if (admin === 'ALL') return { title: 'Assisted sessions in your organisation', rows: await rowsFor(org) };
  if (admin && p.branchId) return { title: 'Assisted sessions in your branch', rows: await rowsFor({ ...org, branchId: p.branchId }) };
  await authorizeAsSignedIn('support.assist', undefined, 'assist.history', 'You cannot see assisted sessions.');
  return { title: 'Sessions you have held', rows: await rowsFor({ ...org, assistantId: p.userId }) };
}

/** Sessions held on my behalf (my Profile page). Not shown to an assistant working on my account. */
export async function listAssistSessionsForMe(): Promise<AssistSessionRow[]> {
  await refuseDuringAssist('assist.held_for_me');
  const p = await getSignedInPrincipal();
  return rowsFor({ subjectId: p.userId });
}
