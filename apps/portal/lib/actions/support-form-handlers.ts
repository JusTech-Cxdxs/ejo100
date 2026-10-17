'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import {
  addSupportNote, assignSupportTicket, createSupportTicket, moveSupportTicket, replyToSupportTicket, saveSupportAnswer, setSupportPriority, setSupportTicketStatus, summariseSupportTicket,
} from './support';
import { changeSupportMailbox, connectSupportMailbox, saveSupportQueue, saveSupportSettings, setMySupportAway, setSupportQueueMembers } from './support-admin';
import { requireUser } from './workshop';
import { reviewEnyoReply } from './support-monitor';

/** <form action> wrappers for the Support centre (each calls the authorised action). */

const str = (f: FormData, k: string) => String(f.get(k) ?? '');
const page = (id: string) => `/crm/support/${encodeURIComponent(id)}`;

function back(id: string, err: unknown, fallback: string): never {
  redirect(`${page(id)}?error=${encodeURIComponent(friendlyError(err, fallback, 'support-form-handlers'))}`);
}

function done(id: string, status: string, hash = ''): never {
  revalidatePath(page(id));
  revalidatePath('/crm/support');
  redirect(`${page(id)}?status=${status}${hash}`);
}

export type SupportReplyState = { error: string | null; body: string; newer?: boolean };

/** Reply to the customer — what was typed stays when something is wrong. */
export async function replyToSupportTicketAction(_prev: SupportReplyState, f: FormData): Promise<SupportReplyState> {
  // Signed out: refuse outright (never an answer with data).
  await requireUser();
  const id = str(f, 'ticketId');
  const body = str(f, 'body');
  let status = 'replied';
  try {
    const r = await replyToSupportTicket(id, body, str(f, 'then') || 'WAITING_ON_CUSTOMER', { seenAt: str(f, 'seenAt') || undefined, aiDrafted: str(f, 'aiDrafted') === '1', confirmNew: str(f, 'confirmNew') === '1' });
    status = r.emailTo ? (r.emailed ? 'replied_emailed' : 'replied_email_failed') : 'replied_no_email';
  } catch (err) {
    const message = friendlyError(err, 'Could not send the reply.', 'support-form-handlers');
    return { error: message, body, newer: /arrived on this ticket after you opened it/.test(message) };
  }
  done(id, status, '#replies');
}

export type SupportNoteState = { error: string | null; body: string };

export async function addSupportNoteAction(_prev: SupportNoteState, f: FormData): Promise<SupportNoteState> {
  await requireUser();
  const id = str(f, 'ticketId');
  const body = str(f, 'body');
  try {
    await addSupportNote(id, body);
  } catch (err) {
    return { error: friendlyError(err, 'Could not save the note.', 'support-form-handlers'), body };
  }
  done(id, 'note_added', '#replies');
}

export async function setSupportTicketStatusAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  try {
    await setSupportTicketStatus(id, str(f, 'status'));
  } catch (err) {
    back(id, err, 'Could not change the status.');
  }
  done(id, 'status_changed');
}

export async function assignSupportTicketAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  const to = str(f, 'assignee');
  try {
    await assignSupportTicket(id, to);
  } catch (err) {
    back(id, err, 'Could not assign the ticket.');
  }
  done(id, to ? 'assigned' : 'unassigned');
}

export async function setSupportPriorityAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  try {
    await setSupportPriority(id, str(f, 'priority'));
  } catch (err) {
    back(id, err, 'Could not change the priority.');
  }
  done(id, 'priority_changed');
}

export async function moveSupportTicketAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  try {
    await moveSupportTicket(id, str(f, 'queueId'));
  } catch (err) {
    back(id, err, 'Could not move the request.');
  }
  done(id, 'moved');
}

export async function summariseSupportTicketAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  try {
    await summariseSupportTicket(id);
  } catch (err) {
    back(id, err, 'Could not summarise the request.');
  }
  done(id, 'summarised');
}

export async function saveSupportAnswerAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  let r: 'learned' | 'skipped' = 'skipped';
  try {
    r = await saveSupportAnswer(id, str(f, 'replyId'));
  } catch (err) {
    back(id, err, 'Could not save the answer.');
  }
  done(id, r === 'learned' ? 'answer_saved' : 'answer_skipped');
}

export type NewSupportState = { error: string | null; values: Record<string, string> };

export async function createSupportTicketAction(_prev: NewSupportState, f: FormData): Promise<NewSupportState> {
  await requireUser();
  const values = Object.fromEntries(['customerId', 'contactName', 'contactPhone', 'contactEmail', 'subject', 'body', 'queueId', 'priority'].map((k) => [k, str(f, k)]));
  let id = '';
  try {
    id = (await createSupportTicket(values)).id;
  } catch (err) {
    return { error: friendlyError(err, 'Could not open the request.', 'support-form-handlers'), values };
  }
  revalidatePath('/crm/support');
  redirect(`${page(id)}?status=created`);
}

export async function setMySupportAwayAction(f: FormData): Promise<void> {
  const away = str(f, 'away') === '1';
  try {
    await setMySupportAway(away);
  } catch (err) {
    redirect(`/crm/support?error=${encodeURIComponent(friendlyError(err, 'Could not change your status.', 'support-form-handlers'))}`);
  }
  revalidatePath('/crm/support');
  redirect(`/crm/support?status=${away ? 'away' : 'back'}`);
}

// ── Set-up (Settings → Support centre) ─────────────────────────────────

const SETUP = '/settings/support';
/** Each set-up page is its own address; a safe id only (never a redirect elsewhere). */
const teamPage = (id: string) => (/^[A-Za-z0-9_-]{1,40}$/.test(id) ? `${SETUP}/teams/${id}` : `${SETUP}/teams`);
const SECTION_PAGE: Record<string, string> = { hours: `${SETUP}/hours`, holidays: `${SETUP}/hours`, enyo: `${SETUP}/enyo`, followups: `${SETUP}/follow-ups` };
/** Back to the page with the message — and, for a form that failed, still open (?edit=) so nothing typed is lost from view. */
function setupBack(err: unknown, fallback: string, page = SETUP, hash = '', edit = ''): never {
  redirect(`${page}?error=${encodeURIComponent(friendlyError(err, fallback, 'support-form-handlers'))}${edit ? `&edit=${edit}` : ''}${hash}`);
}
function setupDone(status: string, page = SETUP, hash = ''): never {
  revalidatePath(SETUP, 'layout');
  revalidatePath('/crm/support');
  redirect(`${page}?status=${status}${hash}`);
}

const minutes = (f: FormData, k: string, unit: 'h' | 'm') => {
  const n = Number(str(f, k));
  return Number.isFinite(n) && n > 0 ? Math.round(unit === 'h' ? n * 60 : n) : undefined;
};

export async function saveSupportQueueAction(f: FormData): Promise<void> {
  let id = str(f, 'id');
  try {
    const targets: Record<string, { first?: number; resolve?: number }> = {};
    for (const p of ['URGENT', 'HIGH', 'NORMAL', 'LOW']) targets[p] = { first: minutes(f, `${p}_first`, 'm'), resolve: minutes(f, `${p}_resolve`, 'h') };
    id = (await saveSupportQueue({
      id: id || undefined, name: str(f, 'name'), kind: str(f, 'kind'), description: str(f, 'description'), branchId: str(f, 'branchId'), aiMode: str(f, 'aiMode') || 'SUGGEST',
      autoAcknowledge: f.get('autoAcknowledge') === 'on', isDefault: f.get('isDefault') === 'on', active: f.get('active') !== 'off', signature: str(f, 'signature'), targets,
      ...(f.has('ackMessage') ? { ackMessage: String(f.get('ackMessage') ?? '') } : {}),
    })).id;
  } catch (err) {
    setupBack(err, 'Could not save the team.', id ? teamPage(id) : `${SETUP}/teams`, id ? '#details' : '#new-queue', id ? 'details' : 'new');
  }
  setupDone('queue_saved', teamPage(id));
}

export async function setSupportQueueMembersAction(f: FormData): Promise<void> {
  const queueId = str(f, 'queueId');
  try {
    const leads = new Set(f.getAll('lead').map(String));
    const members = f.getAll('member').map(String).map((userId) => ({ userId, capacity: Number(str(f, `capacity_${userId}`)) || 15, isLead: leads.has(userId) }));
    await setSupportQueueMembers(queueId, members);
  } catch (err) {
    setupBack(err, 'Could not save who works this team.', teamPage(queueId), '#people', 'people');
  }
  setupDone('members_saved', teamPage(queueId), '#people');
}

export async function connectSupportMailboxAction(f: FormData): Promise<void> {
  const queueId = str(f, 'queueId');
  try {
    await connectSupportMailbox({
      queueId, address: str(f, 'address'), displayName: str(f, 'displayName'), imapHost: str(f, 'imapHost'), imapPort: str(f, 'imapPort'), imapSecurity: str(f, 'imapSecurity'),
      smtpHost: str(f, 'smtpHost'), smtpPort: str(f, 'smtpPort'), smtpSecurity: str(f, 'smtpSecurity'), username: str(f, 'username'), password: String(f.get('password') ?? ''),
    });
  } catch (err) {
    setupBack(err, 'Could not connect the mailbox.', teamPage(queueId), '#addresses', 'address');
  }
  setupDone('mailbox_connected', teamPage(queueId), '#addresses');
}

export async function changeSupportMailboxAction(f: FormData): Promise<void> {
  const action = str(f, 'do') as 'pause' | 'resume' | 'remove';
  const back = teamPage(str(f, 'queueId'));
  try {
    await changeSupportMailbox(str(f, 'mailboxId'), action);
  } catch (err) {
    setupBack(err, 'Could not change the mailbox.', back, '#addresses');
  }
  setupDone(`mailbox_${action}`, back, '#addresses');
}

/** One set-up page's rules (section = hours | holidays | enyo | followups); the other pages' rules stay as they are. */
export async function saveSupportSettingsAction(f: FormData): Promise<void> {
  const section = str(f, 'section');
  const page = SECTION_PAGE[section] ?? `${SETUP}/hours`;
  try {
    if (section === 'hours') {
      const hours: Record<string, [string, string]> = {};
      for (const d of ['1', '2', '3', '4', '5', '6', '7']) {
        if (f.get(`open_${d}`) !== 'on') continue;
        hours[d] = [str(f, `from_${d}`), str(f, `to_${d}`)];
      }
      await saveSupportSettings({ hours });
    } else if (section === 'holidays') {
      await saveSupportSettings({
        holidayCalendar: f.get('calendar') === 'on' ? 'NG' : null,
        holidays: f.getAll('extraDay').map(String),
        holidaysOff: f.getAll('openOn').map(String),
      });
    } else if (section === 'enyo') {
      await saveSupportSettings({ aiThreshold: Number(str(f, 'aiThreshold')) / 100 });
    } else if (section === 'followups') {
      await saveSupportSettings({ nudgeAfterHours: Number(str(f, 'nudgeAfterHours')), autoResolveDays: Number(str(f, 'autoResolveDays')), closeAfterDays: Number(str(f, 'closeAfterDays')), csatEnabled: f.get('csatEnabled') === 'on' });
    } else {
      throw new Error('Nothing to save.');
    }
  } catch (err) {
    setupBack(err, 'Could not save the settings.', page, `#${section}`, section);
  }
  setupDone(`${section}_saved`, page);
}

/** A person's check of an Enyo reply (the Enyo replies page). */
export async function reviewEnyoReplyAction(f: FormData): Promise<void> {
  await requireUser();
  const filter = /^[a-z_]{1,20}$/.test(str(f, 'filter')) ? str(f, 'filter') : 'to_check';
  const days = /^\d{1,3}$/.test(str(f, 'days')) ? str(f, 'days') : '30';
  let status = 'reviewed';
  try {
    const r = await reviewEnyoReply({ replyId: str(f, 'replyId'), verdict: str(f, 'verdict'), reason: str(f, 'reason'), note: str(f, 'note'), corrected: str(f, 'corrected') });
    if (r.learned) status = 'reviewed_learned';
  } catch (err) {
    redirect(`/crm/support/enyo?filter=${filter}&days=${days}&error=${encodeURIComponent(friendlyError(err, 'Could not save your check.', 'support-form-handlers'))}#r-${encodeURIComponent(str(f, 'replyId'))}`);
  }
  revalidatePath('/crm/support/enyo');
  redirect(`/crm/support/enyo?filter=${filter}&days=${days}&status=${status}`);
}
