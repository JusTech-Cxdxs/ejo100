'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { assignSupportTicket, replyToSupportTicket, setSupportTicketStatus } from './support';
import { requireUser } from './workshop';

/** <form action> wrappers for the support inbox (each calls the authorised action). */

const str = (f: FormData, k: string) => String(f.get(k) ?? '');
const page = (id: string) => `/crm/support/${encodeURIComponent(id)}`;

function back(id: string, err: unknown, fallback: string): never {
  redirect(`${page(id)}?error=${encodeURIComponent(friendlyError(err, fallback, 'support-form-handlers'))}`);
}

export type SupportReplyState = { error: string | null; body: string };

/** Reply to the customer — what was typed stays when something is wrong. */
export async function replyToSupportTicketAction(_prev: SupportReplyState, f: FormData): Promise<SupportReplyState> {
  // Signed out: refuse outright (never an answer with data).
  await requireUser();
  const id = str(f, 'ticketId');
  const body = str(f, 'body');
  let status = 'replied';
  try {
    const r = await replyToSupportTicket(id, body, str(f, 'then') || 'WAITING_ON_CUSTOMER');
    status = r.emailTo ? (r.emailed ? 'replied_emailed' : 'replied_email_failed') : 'replied_no_email';
  } catch (err) {
    return { error: friendlyError(err, 'Could not send the reply.', 'support-form-handlers'), body };
  }
  revalidatePath(page(id));
  revalidatePath('/crm/support');
  redirect(`${page(id)}?status=${status}#replies`);
}

export async function setSupportTicketStatusAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  try {
    await setSupportTicketStatus(id, str(f, 'status'));
  } catch (err) {
    back(id, err, 'Could not change the status.');
  }
  revalidatePath(page(id));
  revalidatePath('/crm/support');
  redirect(`${page(id)}?status=status_changed`);
}

export async function assignSupportTicketAction(f: FormData): Promise<void> {
  const id = str(f, 'ticketId');
  const to = str(f, 'assignee');
  try {
    await assignSupportTicket(id, to);
  } catch (err) {
    back(id, err, 'Could not assign the ticket.');
  }
  revalidatePath(page(id));
  revalidatePath('/crm/support');
  redirect(`${page(id)}?status=${to ? 'assigned' : 'unassigned'}`);
}
