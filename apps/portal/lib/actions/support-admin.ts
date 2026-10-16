'use server';

import { prisma, type Prisma } from '@ejo/database';
import { authorize, myOrganisationId, refuseDuringAssist, allows } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { logFailure } from '@/lib/log';
import { encryptSecret, secretAad } from '@/lib/mail/crypto';
import { mailAllowInsecure, mailKey } from '@/lib/mail/config';
import { validateConnect } from '@/lib/mail/rules';
import { MailConnectError, testMailbox } from '@/lib/mail/transport';
import { withinLimit } from '@/lib/mail/account';
import {
  AI_MODES, asAiMode, asQueueKind, DEFAULT_HOURS, DEFAULT_TARGETS, PRIORITIES, readHours, readTargets,
  type AiMode, type Hours, type QueueKind, type Targets,
} from '@/lib/support/core';
import { supportSecretOwner, supportSettings, type SupportSettings } from '@/lib/support/server';

/**
 * Setting up the Support centre (support.manage): teams (queues) with their
 * own email addresses, who works each team and how much, opening hours and
 * holidays, targets per priority, and how Enyo answers. Everything is fenced
 * to the person's own organisation (never "all organisations"), refused in
 * an assisted session, and written to the audit trail without passwords.
 */

class SupportSetupError extends Error {}
const PERM = 'support.manage' as const;

async function supportOrg(where: string): Promise<{ organisationId: string; userId: string }> {
  await authorize(PERM, undefined, where, 'Only administrators set up the Support centre.');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new SupportSetupError('This account is not placed in an organisation yet.');
  return { organisationId, userId: user.id };
}

export type SupportSetup = {
  settings: SupportSettings;
  queues: {
    id: string; name: string; kind: QueueKind; description: string | null; branchId: string | null; isDefault: boolean; active: boolean; aiMode: AiMode; autoAcknowledge: boolean;
    targets: Targets; signature: string | null; members: { userId: string; name: string; capacity: number; away: boolean }[];
    mailboxes: { id: string; address: string; displayName: string | null; status: string; lastSyncAt: Date | null; lastError: string | null; imapHost: string; smtpHost: string }[];
  }[];
  people: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  mailReady: boolean;
};

export async function getSupportSetup(): Promise<SupportSetup> {
  const { organisationId } = await supportOrg('getSupportSetup');
  const [settings, queues, users, branches] = await Promise.all([
    supportSettings(organisationId),
    prisma.supportQueue.findMany({
      where: { organisationId },
      orderBy: [{ active: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
      include: {
        members: { select: { userId: true, capacity: true, away: true } },
        mailboxes: { select: { id: true, address: true, displayName: true, status: true, lastSyncAt: true, lastError: true, imapHost: true, smtpHost: true } },
      },
    }),
    prisma.user.findMany({ where: { organisationId, isActive: true }, orderBy: { fullName: 'asc' }, take: 500, select: { id: true, fullName: true } }),
    prisma.branch.findMany({ where: { businessUnit: { organisationId } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  return {
    settings,
    queues: queues.map((q) => ({
      id: q.id, name: q.name, kind: asQueueKind(q.kind), description: q.description, branchId: q.branchId, isDefault: q.isDefault, active: q.active, aiMode: asAiMode(q.aiMode),
      autoAcknowledge: q.autoAcknowledge, targets: readTargets(q.targets), signature: q.signature,
      members: q.members.map((m) => ({ userId: m.userId, name: name.get(m.userId) ?? 'Former colleague', capacity: m.capacity, away: m.away })).sort((a, b) => a.name.localeCompare(b.name)),
      mailboxes: q.mailboxes,
    })),
    people: users.map((u) => ({ id: u.id, name: u.fullName })),
    branches,
    mailReady: Boolean(mailKey()),
  };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Creates or updates a team. Targets are given in minutes per priority; anything missing keeps the defaults. */
export async function saveSupportQueue(input: {
  id?: string; name?: string; kind?: string; description?: string; branchId?: string; aiMode?: string; autoAcknowledge?: boolean; isDefault?: boolean; active?: boolean; signature?: string;
  targets?: Partial<Record<string, { first?: number; resolve?: number }>>;
}): Promise<{ id: string }> {
  const { organisationId, userId } = await supportOrg('saveSupportQueue');
  await refuseDuringAssist('support.queue.save');
  const name = str(input.name, 60);
  if (name.length < 2) throw new SupportSetupError('Give the team a name, like “Warranty” or “Customer care”.');
  if (/[<>{}]/.test(name)) throw new SupportSetupError('Use letters, numbers and simple punctuation in the name.');
  if (input.aiMode !== undefined && !(AI_MODES as readonly string[]).includes(input.aiMode)) throw new SupportSetupError('Choose how Enyo helps this team.');
  const branchId = str(input.branchId, 40) || null;
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, businessUnit: { organisationId } }, select: { id: true } }))) throw new SupportSetupError('Choose a branch from the list.');
  const targets = readTargets(input.targets ?? DEFAULT_TARGETS);
  for (const p of PRIORITIES) if (targets[p].resolve < targets[p].first) throw new SupportSetupError(`For ${p.toLowerCase()} requests, the resolution target must be longer than the first-answer target.`);
  const data = {
    name, kind: asQueueKind(input.kind), description: str(input.description, 300) || null, branchId, aiMode: asAiMode(input.aiMode), autoAcknowledge: input.autoAcknowledge !== false,
    signature: typeof input.signature === 'string' ? input.signature.replace(/\r\n?/g, '\n').trim().slice(0, 300) || null : null, targets: targets as unknown as Prisma.InputJsonValue,
    active: input.active !== false,
  };
  const existing = input.id ? await prisma.supportQueue.findFirst({ where: { id: String(input.id), organisationId }, select: { id: true } }) : null;
  if (input.id && !existing) throw new SupportSetupError('That team is not available.');
  const clash = await prisma.supportQueue.findFirst({ where: { organisationId, name: { equals: name, mode: 'insensitive' }, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true } });
  if (clash) throw new SupportSetupError('Another team already has that name.');
  const row = existing
    ? await prisma.supportQueue.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.supportQueue.create({ data: { ...data, organisationId, createdById: userId }, select: { id: true } });
  if (input.isDefault) {
    await prisma.$transaction([
      prisma.supportQueue.updateMany({ where: { organisationId, NOT: { id: row.id } }, data: { isDefault: false } }),
      prisma.supportQueue.update({ where: { id: row.id }, data: { isDefault: true, active: true } }),
    ]);
  }
  await writeAuditLog({ userId, organisationId, action: existing ? 'support.queue_updated' : 'support.queue_created', entityType: 'SupportQueue', entityId: row.id, metadata: { name, kind: data.kind, aiMode: data.aiMode, active: data.active, isDefault: Boolean(input.isDefault) } });
  return row;
}

/** Who works a team, and how many open requests each takes at a time (1–100). */
export async function setSupportQueueMembers(queueId: string, members: { userId: string; capacity?: number }[]): Promise<void> {
  const { organisationId, userId } = await supportOrg('setSupportQueueMembers');
  await refuseDuringAssist('support.queue.members');
  const queue = await prisma.supportQueue.findFirst({ where: { id: String(queueId ?? ''), organisationId }, select: { id: true, name: true } });
  if (!queue) throw new SupportSetupError('That team is not available.');
  const list = (Array.isArray(members) ? members : []).slice(0, 200);
  const ids = [...new Set(list.map((m) => String(m.userId ?? '')))].filter(Boolean);
  const valid = await prisma.user.findMany({ where: { id: { in: ids }, organisationId, isActive: true }, select: { id: true } });
  if (valid.length !== ids.length) throw new SupportSetupError('Choose colleagues from the list.');
  const cap = (n: unknown) => Math.min(100, Math.max(1, Math.round(Number(n) || 15)));
  await prisma.$transaction([
    prisma.supportQueueMember.deleteMany({ where: { queueId: queue.id, organisationId, userId: { notIn: ids } } }),
    ...list.filter((m) => ids.includes(m.userId)).map((m) => prisma.supportQueueMember.upsert({
      where: { queueId_userId: { queueId: queue.id, userId: m.userId } },
      create: { queueId: queue.id, userId: m.userId, organisationId, capacity: cap(m.capacity) },
      update: { capacity: cap(m.capacity) },
    })),
  ]);
  await writeAuditLog({ userId, organisationId, action: 'support.queue_members_set', entityType: 'SupportQueue', entityId: queue.id, metadata: { name: queue.name, members: ids.length } });
}

/** A colleague marks themselves away (or back) on every team they work: no new requests come to them while away. */
export async function setMySupportAway(away: boolean): Promise<void> {
  await authorize('support.tickets.manage', undefined, 'setMySupportAway');
  const user = await requireUser();
  await refuseDuringAssist('support.away');
  const organisationId = await myOrganisationId();
  await prisma.supportQueueMember.updateMany({ where: { userId: user.id, organisationId: organisationId ?? '__no_organisation__' }, data: { away: Boolean(away) } });
  await writeAuditLog({ userId: user.id, organisationId, action: away ? 'support.agent_away' : 'support.agent_back', entityType: 'User', entityId: user.id, metadata: {} });
}

export async function getMySupportAway(): Promise<{ member: boolean; away: boolean }> {
  if (!(await allows('support.tickets.manage'))) return { member: false, away: false };
  const user = await requireUser();
  const rows = await prisma.supportQueueMember.findMany({ where: { userId: user.id, organisationId: (await myOrganisationId()) ?? '__no_organisation__' }, select: { away: true } });
  return { member: rows.length > 0, away: rows.length > 0 && rows.every((r) => r.away) };
}

/**
 * Connects a shared support mailbox (support@, warranty@ …) to a team: checks
 * both servers first, then saves the password encrypted. The organisation
 * must own the address (one address, one team).
 */
export async function connectSupportMailbox(input: Record<string, unknown> & { queueId?: string }): Promise<{ id: string }> {
  const { organisationId, userId } = await supportOrg('connectSupportMailbox');
  await refuseDuringAssist('support.mailbox.connect');
  const key = mailKey();
  if (!key) throw new SupportSetupError('Email is not set up for this installation yet (MAILBOX_ENCRYPTION_KEY). JusTech sets it in the server environment.');
  const queue = await prisma.supportQueue.findFirst({ where: { id: String(input.queueId ?? ''), organisationId }, select: { id: true, name: true } });
  if (!queue) throw new SupportSetupError('Choose the team this address belongs to.');
  const v = validateConnect(input ?? {}, { allowInsecure: mailAllowInsecure() });
  if (!v.ok) throw new SupportSetupError(v.message.replace('Enter your work email address', 'Enter the support address'));
  const s = v.value;
  if (!withinLimit(`support-connect:${organisationId}`, 10, 10 * 60_000)) throw new SupportSetupError('Too many connection attempts. Wait ten minutes, then try again.');
  const taken = await prisma.supportMailbox.findFirst({ where: { organisationId, address: s.address }, select: { id: true, queueId: true } });
  if (taken && taken.queueId !== queue.id) throw new SupportSetupError('That address is already connected to another team. Remove it there first.');
  try {
    await testMailbox(
      { host: s.imapHost, port: s.imapPort, security: s.imapSecurity, username: s.username, password: s.password },
      { host: s.smtpHost, port: s.smtpPort, security: s.smtpSecurity, username: s.username, password: s.password },
    );
  } catch (err) {
    if (err instanceof MailConnectError) throw new SupportSetupError(err.message);
    logFailure('Support mailbox connection test failed', err);
    throw new SupportSetupError('The connection could not be checked just now. Please try again.');
  }
  const secret = encryptSecret(s.password, key, secretAad(supportSecretOwner(organisationId), s.address));
  const data = {
    queueId: queue.id, displayName: s.displayName || null, imapHost: s.imapHost, imapPort: s.imapPort, imapSecure: s.imapSecurity === 'tls',
    smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpSecure: s.smtpSecurity === 'tls', username: s.username, secret, status: 'ACTIVE', lastError: null,
  };
  const row = taken
    ? await prisma.supportMailbox.update({ where: { id: taken.id }, data, select: { id: true } })
    : await prisma.supportMailbox.create({ data: { ...data, organisationId, address: s.address, createdById: userId }, select: { id: true } });
  await writeAuditLog({ userId, organisationId, action: taken ? 'support.mailbox_reconnected' : 'support.mailbox_connected', entityType: 'SupportMailbox', entityId: row.id, metadata: { address: s.address, queue: queue.name, imapHost: s.imapHost, smtpHost: s.smtpHost } });
  return row;
}

/** Pause (stop reading and sending from it), resume, or remove a support mailbox. Removing deletes the stored password. */
export async function changeSupportMailbox(id: string, action: 'pause' | 'resume' | 'remove'): Promise<void> {
  const { organisationId, userId } = await supportOrg('changeSupportMailbox');
  await refuseDuringAssist('support.mailbox.change');
  const box = await prisma.supportMailbox.findFirst({ where: { id: String(id ?? ''), organisationId }, select: { id: true, address: true } });
  if (!box) throw new SupportSetupError('That mailbox is not available.');
  if (action === 'remove') await prisma.supportMailbox.delete({ where: { id: box.id } });
  else if (action === 'pause' || action === 'resume') await prisma.supportMailbox.update({ where: { id: box.id }, data: { status: action === 'pause' ? 'PAUSED' : 'ACTIVE', lastError: null } });
  else throw new SupportSetupError('Choose what to do with the mailbox.');
  await writeAuditLog({ userId, organisationId, action: `support.mailbox_${action === 'remove' ? 'removed' : action === 'pause' ? 'paused' : 'resumed'}`, entityType: 'SupportMailbox', entityId: box.id, metadata: { address: box.address } });
}

/** Opening hours, holidays, how sure Enyo must be, reminders and closing, and the satisfaction question. */
export async function saveSupportSettings(input: { hours?: Hours; holidays?: string[]; aiThreshold?: number; nudgeAfterHours?: number; autoResolveDays?: number; closeAfterDays?: number; csatEnabled?: boolean }): Promise<void> {
  const { organisationId, userId } = await supportOrg('saveSupportSettings');
  await refuseDuringAssist('support.settings');
  const hours = readHours(input.hours ?? DEFAULT_HOURS);
  const holidays = [...new Set((Array.isArray(input.holidays) ? input.holidays : []).map((d) => String(d).trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))))].sort().slice(0, 60);
  const num = (v: unknown, lo: number, hi: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const data = {
    hours: hours as unknown as Prisma.InputJsonValue, holidays,
    aiThreshold: Math.round(num(input.aiThreshold, 0.5, 0.99, 0.75) * 100) / 100,
    nudgeAfterHours: Math.round(num(input.nudgeAfterHours, 12, 240, 48)),
    autoResolveDays: Math.round(num(input.autoResolveDays, 2, 30, 7)),
    closeAfterDays: Math.round(num(input.closeAfterDays, 1, 28, 4)),
    csatEnabled: input.csatEnabled !== false,
  };
  await prisma.supportSetting.upsert({ where: { organisationId }, create: { organisationId, ...data, updatedById: userId }, update: { ...data, updatedById: userId } });
  await writeAuditLog({ userId, organisationId, action: 'support.settings_changed', entityType: 'SupportSetting', entityId: organisationId, metadata: { aiThreshold: data.aiThreshold, nudgeAfterHours: data.nudgeAfterHours, autoResolveDays: data.autoResolveDays, closeAfterDays: data.closeAfterDays, csatEnabled: data.csatEnabled, holidays: holidays.length } });
}
