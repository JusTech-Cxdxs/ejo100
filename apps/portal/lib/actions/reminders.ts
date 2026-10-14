'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { recordLinks, recordVisibleToMe } from '@/lib/reminders';
import { resolveRecords } from '@/lib/record-resolver';
import {
  delegateRefusal, isId, isReminderRecordType, mayCreateFor, mayManage, parseLagosLocal, reminderBucket, snoozeUntil, validateReminder,
  type ReminderRecordType, type ReminderState, type SnoozeKind,
} from '@/lib/reminders-rules';

/**
 * Reminders. A reminder belongs to one person (the owner). It is set by the
 * owner, or by a colleague the owner has allowed ("Who may set reminders for
 * me"), or by Enyo at the owner's request (Enyo only prepares the form; the
 * person presses Save). Only the owner edits, snoozes, completes or cancels
 * it. Everything is fenced to the person's organisation.
 */

class ReminderError extends Error {}

const CLOSED_MEANWHILE = 'This reminder was closed a moment ago. Refresh the page.';

type Me = { id: string; organisationId: string };

async function me(): Promise<Me> {
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new ReminderError('Your account is not linked to an organisation yet. Ask your administrator.');
  return { id: user.id, organisationId };
}

/** One of the signed-in person's own reminders — or "not available". */
async function ownReminder(m: Me, id: string) {
  const r = isId(id) ? await prisma.reminder.findFirst({ where: { id, organisationId: m.organisationId, ownerId: m.id } }) : null;
  if (!r || !mayManage(m.id, r)) throw new ReminderError('This reminder is not available. It may have been removed.');
  return r;
}

/** Owners (in my organisation) who allow me to set reminders for them. */
async function ownersWhoGrantedMe(m: Me): Promise<{ id: string; fullName: string }[]> {
  const grants = await prisma.reminderDelegate.findMany({ where: { delegateId: m.id, organisationId: m.organisationId }, select: { ownerId: true } });
  if (!grants.length) return [];
  return prisma.user.findMany({ where: { id: { in: grants.map((g: { ownerId: string }) => g.ownerId) }, organisationId: m.organisationId, isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
}

export type ReminderRow = {
  id: string; title: string; notes: string | null; dueAt: Date; status: ReminderState; viaEmail: boolean; source: string;
  sentAt: Date | null; doneAt: Date | null; setBy: string | null; record: { label: string; url: string | null } | null; createdAt: Date; updatedAt: Date;
};

async function toRows(m: Me, rows: { id: string; title: string; notes: string | null; dueAt: Date; status: ReminderState; viaEmail: boolean; source: string; sentAt: Date | null; doneAt: Date | null; createdById: string; recordType: string | null; recordId: string | null; recordRef: string | null; createdAt: Date; updatedAt: Date }[]): Promise<ReminderRow[]> {
  const setters = [...new Set(rows.filter((r) => r.createdById !== m.id).map((r) => r.createdById))];
  const [people, links] = await Promise.all([
    setters.length ? prisma.user.findMany({ where: { id: { in: setters } }, select: { id: true, fullName: true } }) : Promise.resolve([] as { id: string; fullName: string }[]),
    recordLinks(rows.flatMap((r) => (isReminderRecordType(r.recordType) && r.recordId ? [{ type: r.recordType, id: r.recordId }] : []))),
  ]);
  const name = new Map(people.map((p: { id: string; fullName: string }) => [p.id, p.fullName]));
  return rows.map((r) => {
    const link = r.recordType && r.recordId ? links.get(`${r.recordType}:${r.recordId}`) : undefined;
    return {
      id: r.id, title: r.title, notes: r.notes, dueAt: r.dueAt, status: r.status, viaEmail: r.viaEmail, source: r.source, sentAt: r.sentAt, doneAt: r.doneAt,
      setBy: r.createdById === m.id ? null : name.get(r.createdById) ?? 'A colleague',
      // A record the person cannot open is named (as it was when set) but not linked.
      record: link ? { label: link.label, url: link.url } : r.recordRef ? { label: r.recordRef, url: null } : null,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
  });
}

const ROW_SELECT = { id: true, title: true, notes: true, dueAt: true, status: true, viaEmail: true, source: true, sentAt: true, doneAt: true, createdById: true, recordType: true, recordId: true, recordRef: true, createdAt: true, updatedAt: true } as const;

/** My reminders: overdue (due or delivered, not done), upcoming, and the last 30 done or cancelled. */
export async function listMyReminders(): Promise<{ overdue: ReminderRow[]; upcoming: ReminderRow[]; done: ReminderRow[] }> {
  const m = await me();
  const [open, closed] = await Promise.all([
    prisma.reminder.findMany({ where: { ownerId: m.id, organisationId: m.organisationId, status: { in: ['PENDING', 'SENT'] } }, orderBy: { dueAt: 'asc' }, take: 300, select: ROW_SELECT }),
    prisma.reminder.findMany({ where: { ownerId: m.id, organisationId: m.organisationId, status: { in: ['DONE', 'CANCELLED'] } }, orderBy: { updatedAt: 'desc' }, take: 30, select: ROW_SELECT }),
  ]);
  const rows = await toRows(m, [...open, ...closed]);
  const now = new Date();
  return {
    overdue: rows.filter((r) => reminderBucket(r, now) === 'overdue'),
    upcoming: rows.filter((r) => reminderBucket(r, now) === 'upcoming'),
    done: rows.filter((r) => reminderBucket(r, now) === 'done'),
  };
}

/** One of my reminders, for the edit page (null when not mine / gone). */
export async function getMyReminder(id: string): Promise<ReminderRow | null> {
  const m = await me();
  const r = isId(id) ? await prisma.reminder.findFirst({ where: { id, ownerId: m.id, organisationId: m.organisationId }, select: ROW_SELECT }) : null;
  return r ? (await toRows(m, [r]))[0]! : null;
}

/** For the form: me, and the colleagues who allow me to set reminders for them. */
export async function getReminderFormOptions(): Promise<{ me: { id: string; fullName: string }; owners: { id: string; fullName: string }[] }> {
  const m = await me();
  const [self, owners] = await Promise.all([
    prisma.user.findUnique({ where: { id: m.id }, select: { id: true, fullName: true } }),
    ownersWhoGrantedMe(m),
  ]);
  return { me: self ?? { id: m.id, fullName: 'Me' }, owners };
}

/** The record a new reminder would point at — only when the person may open it. */
export async function previewReminderRecord(recordType: string, recordId: string): Promise<{ label: string; url: string } | null> {
  await me();
  if (!isReminderRecordType(recordType) || !isId(recordId)) return null;
  return (await recordLinks([{ type: recordType, id: recordId }])).get(`${recordType}:${recordId}`) ?? null;
}

export type ReminderInput = { forUserId?: string; title?: string; notes?: string; dueAt?: string; viaEmail?: boolean | string; recordType?: string; recordId?: string; source?: 'form' | 'enyo'; removeRecord?: boolean };

async function linkFor(type: unknown, id: unknown): Promise<{ recordType: ReminderRecordType; recordId: string; recordRef: string } | null> {
  if (!type && !id) return null;
  if (!isReminderRecordType(type) || !isId(id)) throw new ReminderError('That record cannot be linked to a reminder.');
  // Only a record the person setting the reminder may open.
  if (!(await recordVisibleToMe(type, id))) throw new ReminderError('That record is not available to you, so it cannot be linked.');
  const label = (await resolveRecords([{ type, id }])).get(`${type}:${id}`)?.label ?? type;
  return { recordType: type, recordId: id, recordRef: label.slice(0, 160) };
}

/** Set a reminder for myself, or for a colleague who has allowed me. */
export async function createReminder(input: ReminderInput): Promise<{ id: string }> {
  const m = await me();
  const ownerId = isId(input?.forUserId) ? input.forUserId : m.id;
  if (ownerId !== m.id) {
    const granted = await ownersWhoGrantedMe(m);
    if (!mayCreateFor(m.id, ownerId, granted.map((g) => g.id))) throw new ReminderError('This colleague has not allowed you to set reminders for them. They can allow it on their Reminders page.');
  }
  const v = validateReminder({ title: input?.title, notes: input?.notes, dueAt: input?.dueAt, viaEmail: input?.viaEmail });
  if (!v.ok) throw new ReminderError(v.message);
  const link = await linkFor(input?.recordType, input?.recordId);
  const owner = ownerId === m.id ? null : await prisma.user.findFirst({ where: { id: ownerId, organisationId: m.organisationId, isActive: true }, select: { fullName: true } });
  if (ownerId !== m.id && !owner) throw new ReminderError('That colleague is not available.');
  const r = await prisma.reminder.create({
    data: {
      organisationId: m.organisationId, ownerId, createdById: m.id, source: input?.source === 'enyo' ? 'enyo' : 'form',
      title: v.value.title, notes: v.value.notes || null, dueAt: v.value.dueAt, viaEmail: v.value.viaEmail, ...(link ?? {}),
    },
    select: { id: true },
  });
  await writeAuditLog({ userId: m.id, action: 'reminder.created', entityType: 'Reminder', entityId: r.id, metadata: { dueAt: v.value.dueAt.toISOString(), ...(owner ? { forName: owner.fullName } : {}), ...(link ? { recordRef: link.recordRef } : {}), ...(input?.source === 'enyo' ? { preparedBy: 'Enyo' } : {}) } });
  return r;
}

/** Change my own reminder (title, notes, time, email; the link can be removed). A new time puts a delivered reminder back to waiting. */
export async function updateReminder(id: string, input: ReminderInput): Promise<void> {
  const m = await me();
  const r = await ownReminder(m, id);
  if (r.status === 'DONE' || r.status === 'CANCELLED') throw new ReminderError('This reminder is closed. Set a new one instead.');
  // Keeping the same time is fine even when it has passed (only the title or notes changed).
  const typed = parseLagosLocal(input?.dueAt);
  const unchanged = Boolean(typed) && Math.abs(typed!.getTime() - r.dueAt.getTime()) < 60_000;
  const v = validateReminder({ title: input?.title, notes: input?.notes, dueAt: unchanged ? r.dueAt : input?.dueAt, viaEmail: input?.viaEmail }, unchanged ? new Date(Math.min(Date.now(), r.dueAt.getTime())) : new Date());
  if (!v.ok) throw new ReminderError(v.message);
  const moved = !unchanged;
  // Compare-and-set: only while still open (the delivery job or another tab may have just changed it).
  const changed = await prisma.reminder.updateMany({
    where: { id: r.id, ownerId: m.id, status: { in: ['PENDING', 'SENT'] } },
    data: {
      title: v.value.title, notes: v.value.notes || null, dueAt: v.value.dueAt, viaEmail: v.value.viaEmail,
      ...(moved ? { status: 'PENDING', sentAt: null } : {}),
      ...(input?.removeRecord === true ? { recordType: null, recordId: null, recordRef: null } : {}),
    },
  });
  if (changed.count === 0) throw new ReminderError(CLOSED_MEANWHILE);
  await writeAuditLog({ userId: m.id, action: 'reminder.changed', entityType: 'Reminder', entityId: r.id, metadata: { dueAt: v.value.dueAt.toISOString() } });
}

export async function completeReminder(id: string): Promise<void> {
  const m = await me();
  const r = await ownReminder(m, id);
  if (r.status === 'DONE') return;
  if (r.status === 'CANCELLED') throw new ReminderError('This reminder was cancelled.');
  const changed = await prisma.reminder.updateMany({ where: { id: r.id, ownerId: m.id, status: { in: ['PENDING', 'SENT'] } }, data: { status: 'DONE', doneAt: new Date() } });
  if (changed.count === 0) throw new ReminderError(CLOSED_MEANWHILE);
  await writeAuditLog({ userId: m.id, action: 'reminder.done', entityType: 'Reminder', entityId: r.id });
}

export async function cancelReminder(id: string): Promise<void> {
  const m = await me();
  const r = await ownReminder(m, id);
  if (r.status === 'CANCELLED') return;
  if (r.status === 'DONE') throw new ReminderError('This reminder is already done.');
  const changed = await prisma.reminder.updateMany({ where: { id: r.id, ownerId: m.id, status: { in: ['PENDING', 'SENT'] } }, data: { status: 'CANCELLED' } });
  if (changed.count === 0) throw new ReminderError(CLOSED_MEANWHILE);
  await writeAuditLog({ userId: m.id, action: 'reminder.cancelled', entityType: 'Reminder', entityId: r.id });
}

/** Snooze: one hour from now, or 9 am tomorrow (Lagos). */
export async function snoozeReminder(id: string, kind: SnoozeKind): Promise<{ dueAt: Date }> {
  const m = await me();
  const r = await ownReminder(m, id);
  if (r.status === 'DONE' || r.status === 'CANCELLED') throw new ReminderError('This reminder is closed.');
  const dueAt = snoozeUntil(kind === 'tomorrow' ? 'tomorrow' : '1h');
  const changed = await prisma.reminder.updateMany({ where: { id: r.id, ownerId: m.id, status: { in: ['PENDING', 'SENT'] } }, data: { dueAt, status: 'PENDING', sentAt: null } });
  if (changed.count === 0) throw new ReminderError(CLOSED_MEANWHILE);
  await writeAuditLog({ userId: m.id, action: 'reminder.snoozed', entityType: 'Reminder', entityId: r.id, metadata: { dueAt: dueAt.toISOString() } });
  return { dueAt };
}

// ── Who may set reminders for me ───────────────────────────────────────

export type DelegateRow = { userId: string; fullName: string; since: Date };

export async function listReminderDelegates(): Promise<{ delegates: DelegateRow[]; canSetFor: { id: string; fullName: string }[] }> {
  const m = await me();
  const [grants, canSetFor] = await Promise.all([
    prisma.reminderDelegate.findMany({ where: { ownerId: m.id, organisationId: m.organisationId }, orderBy: { createdAt: 'asc' }, select: { delegateId: true, createdAt: true } }),
    ownersWhoGrantedMe(m),
  ]);
  const people = grants.length ? await prisma.user.findMany({ where: { id: { in: grants.map((g: { delegateId: string }) => g.delegateId) }, organisationId: m.organisationId }, select: { id: true, fullName: true } }) : [];
  const name = new Map(people.map((p: { id: string; fullName: string }) => [p.id, p.fullName]));
  return {
    delegates: grants.flatMap((g: { delegateId: string; createdAt: Date }) => (name.has(g.delegateId) ? [{ userId: g.delegateId, fullName: name.get(g.delegateId)!, since: g.createdAt }] : [])),
    canSetFor,
  };
}

/** Allow a colleague (in my organisation) to set reminders for me. */
export async function grantReminderDelegate(delegateUserId: string): Promise<void> {
  await refuseDuringAssist('reminders.delegate');
  const m = await me();
  const delegate = isId(delegateUserId) ? await prisma.user.findFirst({ where: { id: delegateUserId, organisationId: m.organisationId, roles: { none: { role: { isSuperAdmin: true } } } }, select: { id: true, isActive: true, organisationId: true, fullName: true } }) : null;
  const refusal = delegateRefusal(m.id, delegate, m.organisationId);
  if (refusal) throw new ReminderError(refusal);
  const existing = await prisma.reminderDelegate.findUnique({ where: { ownerId_delegateId: { ownerId: m.id, delegateId: delegate!.id } } });
  if (existing) return;
  await prisma.reminderDelegate.create({ data: { organisationId: m.organisationId, ownerId: m.id, delegateId: delegate!.id } });
  await writeAuditLog({ userId: m.id, action: 'reminder.delegate_granted', entityType: 'ReminderDelegate', entityId: delegate!.id, metadata: { delegateName: delegate!.fullName } });
}

/** Withdraw it. Reminders they already set for me stay (they are mine). */
export async function withdrawReminderDelegate(delegateUserId: string): Promise<void> {
  await refuseDuringAssist('reminders.delegate');
  const m = await me();
  if (!isId(delegateUserId)) return;
  const removed = await prisma.reminderDelegate.deleteMany({ where: { ownerId: m.id, delegateId: delegateUserId, organisationId: m.organisationId } });
  if (!removed.count) return;
  const who = await prisma.user.findUnique({ where: { id: delegateUserId }, select: { fullName: true } });
  await writeAuditLog({ userId: m.id, action: 'reminder.delegate_withdrawn', entityType: 'ReminderDelegate', entityId: delegateUserId, metadata: { delegateName: who?.fullName ?? null } });
}
