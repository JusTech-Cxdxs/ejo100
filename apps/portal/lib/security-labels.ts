import { humanizeAction } from '@/lib/humanize-action';

/** Readable audit wording for every Security action. */
export const SECURITY_ACTION_LABEL: Record<string, string> = {
  'visit.pre_registered': 'Visit booked',
  'visit.booking_changed': 'Booking changed',
  'visit.booking_expired': 'Booking removed — the visitor did not come',
  'visit.arrived': 'Recorded at the gate — pass issued',
  'visit.checked_in': 'Checked in at the gate — pass issued',
  'visit.received': 'Received at reception — host told',
  'visit.extended': 'Stay extended',
  'visit.checked_out': 'Checked out',
  'visit.cancelled': 'Booking cancelled and removed',
  'visit.overdue': 'Stayed longer than expected',
  'exit_pass.requested': 'Exit pass requested',
  'exit_pass.head_authorised': 'Authorised by the Department Head',
  'exit_pass.manager_approved': 'Approved by the Manager',
  'exit_pass.declined': 'Declined',
  'exit_pass.cancelled': 'Cancelled',
  'exit_pass.gate_out': 'Time out recorded at the gate',
  'exit_pass.gate_in': 'Time in recorded at the gate',
  'exit_pass.overdue': 'Not back on time',
  'exit_pass.extended': 'Return time extended',
  'security.follow_up': 'Follow-up',
  'security.email_sent': 'Email sent',
  'security.email_failed': 'Email could not be sent',
  'vehicle.gate_exit': 'Vehicle left through the gate',
  'incident.reported': 'Incident reported',
  'reminder.created': 'Reminder set',
  'reminder.changed': 'Reminder changed',
  'reminder.snoozed': 'Reminder snoozed',
  'reminder.done': 'Reminder marked done',
  'reminder.cancelled': 'Reminder cancelled',
  'reminder.sent': 'Reminder delivered',
  'reminder.delegate_granted': 'Allowed a colleague to set reminders',
  'reminder.delegate_withdrawn': 'Withdrew a colleague\'s permission to set reminders',
  'mailbox.connected': 'Work mailbox connected',
  'mailbox.reconnected': 'Work mailbox password updated',
  'mailbox.disconnected': 'Work mailbox disconnected (stored copies deleted)',
  'mailbox.ai_consent_given': 'Allowed Enyo to sort and summarise email',
  'mailbox.ai_consent_declined': 'Chose not to let Enyo read email',
  'mailbox.ai_consent_withdrawn': 'Withdrew Enyo\'s access to email (summaries deleted)',
  'broadcast.created': 'Broadcast published',
  'broadcast.stopped': 'Broadcast stopped',
  'broadcast.reactivated': 'Broadcast reactivated',
  'broadcast.deleted': 'Broadcast deleted',
  'broadcast.emailed': 'Broadcast emailed',
  'contractor.requested': 'Contractor pass requested',
  'contractor.approved': 'Contractor pass approved by the Manager',
  'contractor.declined': 'Contractor pass declined',
  'contractor.cancelled': 'Contractor pass cancelled',
  'contractor.revoked': 'Contractor pass revoked',
  'contractor.signed_in': 'Contractors signed in',
  'contractor.signed_out': 'Contractors signed out',
  'appointment.visitors_added': 'Visitors added',
  'appointment.visitors_changed': 'Visitors changed',
  'appointment.visitors_removed': 'Visitors removed',
  'incident.linked': 'Incident reported about this record',
  'incident.assigned': 'Incident assigned',
  'incident.closed': 'Incident closed',
  'incident.reopened': 'Incident reopened',
  'delivery.expected': 'Delivery announced',
  'delivery.arrived': 'Delivery arrived at the gate',
  'delivery.received': 'Received by the Store',
  'delivery.left': 'Delivery vehicle left',
  'delivery.cancelled': 'Delivery cancelled',
  'appointment.created': 'Appointment booked',
  'appointment.changed': 'Appointment changed',
  'appointment.cancelled': 'Appointment cancelled',
  'appointment.completed': 'Appointment completed',
  'appointment.no_show': 'Marked as a no-show',
  'appointment.reminder_sent': 'Reminder emailed',
  'road_test.requested': 'Road test requested',
  'road_test.approved': 'Road test approved by the Manager',
  'road_test.declined': 'Road test declined',
  'road_test.cancelled': 'Road test cancelled',
  'road_test.gate_out': 'Out on road test',
  'road_test.gate_in': 'Back from road test',
  'road_test.extended': 'Road test extended',
  'assist.started': 'Assisted session started',
  'assist.ended': 'Assisted session ended',
  'assist.consent_failed': 'Assisted session: wrong password typed',
  'assist.refused': 'Assisted session refused',
  // Support centre (v36)
  'support.ticket_opened': 'New support request',
  'support.customer_replied': 'Customer replied on a support request',
  'support.replied': 'Support reply sent',
  'support.note_added': 'Note added on a support request',
  'support.assigned': 'Support request assigned',
  'support.status_changed': 'Support request status changed',
  'support.priority_changed': 'Support request priority changed',
  'support.queue_changed': 'Support request moved to another team',
  'support.ai_answered': 'Enyo answered a support request',
  'support.sla_warning': 'Support request: first answer due soon',
  'support.sla_breached': 'Support request: first answer is late',
  'support.urgent': 'Urgent support request (safety)',
  'support.auto_resolved': 'Support request resolved (no reply from the customer)',
  'support.customer_confirmed': 'Customer said the answer solved it',
  'support.customer_asked_person': 'Customer asked for a person',
  'support.customer_rated': 'Customer rated the support',
  'support.help_requested': 'A colleague asked for help',
  'support.reopened': 'Support request reopened',
  'support.ai_reviewed': 'Enyo’s support reply checked',
  'user.signed_in': 'Signed in',
  'user.sign_in_failed': 'Failed sign-in',
  'customer.sign_in_failed': 'Customer failed to sign in',
  'integrity.alert_raised': 'Integrity alert raised',
  'integrity.alert_reviewed': 'Integrity alert reviewed',
  'integrity.speak_up': 'Concern raised (Speak up)',
  'integrity.scan': 'Integrity checks run',
};

export function securityActionLabel(action: string): string {
  return SECURITY_ACTION_LABEL[action] ?? humanizeAction(action);
}

/** One readable line of detail for an entry, or null. */
export function securityActionDetail(action: string, meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const s = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : null);
  switch (action) {
    case 'assist.ended':
      return s('summary');
    case 'support.ticket_opened':
    case 'support.sla_warning':
    case 'support.sla_breached':
    case 'support.urgent':
    case 'support.ai_answered':
    case 'support.customer_confirmed':
    case 'support.customer_asked_person':
      return [s('queue'), s('priority') && s('priority') !== 'NORMAL' ? `${s('priority')!.charAt(0)}${s('priority')!.slice(1).toLowerCase()} priority` : null].filter(Boolean).join(' · ') || null;
    case 'support.customer_rated':
      return typeof meta.score === 'number' ? `${meta.score} out of 5` : null;
    case 'assist.started':
      return `${s('assistant') ?? 'A Branch Assistant'} is helping ${s('colleague') ?? 'a colleague'}${s('reason') ? ` — ${s('reason')}` : ''}`;
    case 'assist.consent_failed':
    case 'assist.refused':
      return [s('colleague'), s('reason')].filter(Boolean).join(' — ') || null;
    case 'security.email_sent':
    case 'security.email_failed':
      return `To ${s('to') ?? 'recipient'} — ${s('subject') ?? ''}${s('error') ? ` (${s('error')})` : ''}`;
    case 'visit.checked_in':
    case 'visit.arrived':
      return [s('passNumber') ? `Pass ${s('passNumber')}` : null, s('vehicle') ? (s('vehicle') === 'On foot' ? 'on foot' : `vehicle ${s('vehicle')}`) : null].filter(Boolean).join(' · ') || null;
    case 'exit_pass.extended':
      return `By ${s('extra') ?? ''}${s('reason') ? ` — ${s('reason')}` : ''}`;
    case 'road_test.requested':
      return [s('permitNumber'), s('driver') ? `driver ${s('driver')}` : null].filter(Boolean).join(' · ') || null;
    case 'road_test.gate_out':
      return [s('permitNumber'), typeof meta.odometer === 'number' ? `${(meta.odometer as number).toLocaleString('en-NG')} km` : null].filter(Boolean).join(' · ') || null;
    case 'road_test.gate_in':
      return [s('permitNumber'), typeof meta.odometer === 'number' ? `${(meta.odometer as number).toLocaleString('en-NG')} km` : null, typeof meta.distance === 'number' ? `${(meta.distance as number).toLocaleString('en-NG')} km driven` : null, s('away'), s('notes')].filter(Boolean).join(' · ') || null;
    case 'road_test.extended':
      return `By ${s('extra') ?? ''}${s('reason') ? ` — ${s('reason')}` : ''}`;
    case 'road_test.approved':
    case 'road_test.declined':
    case 'road_test.cancelled':
      return [s('permitNumber'), s('reason') ? `Reason: ${s('reason')}` : null].filter(Boolean).join(' · ') || null;
    case 'appointment.created':
    case 'appointment.changed':
      return [s('title'), s('onBehalfOf') ? `for ${s('onBehalfOf')}` : null].filter(Boolean).join(' · ') || null;
    case 'appointment.cancelled':
      return s('reason') ? `Reason: ${s('reason')}` : null;
    case 'appointment.completed':
      return s('by');
    case 'appointment.reminder_sent':
      return typeof meta.minutesBefore === 'number' ? `About ${meta.minutesBefore} ${meta.minutesBefore === 1 ? 'minute' : 'minutes'} before` : null;
    case 'contractor.requested':
      return [s('passNumber'), s('company'), typeof meta.people === 'number' ? `${meta.people} ${meta.people === 1 ? 'person' : 'people'}` : null, typeof meta.days === 'number' ? `${meta.days} ${meta.days === 1 ? 'day' : 'days'}` : null].filter(Boolean).join(' · ') || null;
    case 'contractor.signed_in':
      return typeof meta.people === 'number' ? `${meta.people} of ${meta.of} ${meta.of === 1 ? 'person' : 'people'}` : null;
    case 'contractor.signed_out':
      return [typeof meta.people === 'number' ? `${meta.people} ${meta.people === 1 ? 'person' : 'people'}` : null, s('onSite') ? `on site ${s('onSite')}` : null, s('note')].filter(Boolean).join(' · ') || null;
    case 'contractor.declined':
    case 'contractor.cancelled':
    case 'contractor.revoked':
      return s('reason') ? `Reason: ${s('reason')}` : null;
    case 'appointment.visitors_added':
    case 'appointment.visitors_changed':
    case 'appointment.visitors_removed':
      return [s('visitNumber'), s('visitors'), s('organisation'), s('reason') ? `Reason: ${s('reason')}` : null].filter(Boolean).join(' · ') || null;
    case 'broadcast.created':
      return [s('title'), s('duration'), meta.email ? 'emailed' : null].filter(Boolean).join(' · ') || null;
    case 'broadcast.reactivated':
      return [s('duration'), meta.email ? 'emailed again' : null].filter(Boolean).join(' · ') || null;
    case 'broadcast.emailed':
      return typeof meta.sent === 'number' ? `${meta.sent} ${meta.sent === 1 ? 'email' : 'emails'} sent${typeof meta.failed === 'number' && meta.failed ? `, ${meta.failed} failed` : ''}` : null;
    case 'incident.reported':
    case 'incident.linked':
      return [s('incidentNumber'), s('type'), s('severity') ? s('severity')!.toLowerCase() : null, s('related') ? `about ${s('related')}` : null].filter(Boolean).join(' · ') || null;
    case 'incident.assigned':
      return s('to') ? `To ${s('to')}` : null;
    case 'incident.closed':
      return s('resolution') ? `Resolution: ${s('resolution')}` : null;
    case 'incident.reopened':
    case 'delivery.cancelled':
      return s('reason') ? `Reason: ${s('reason')}` : null;
    case 'delivery.expected':
      return [s('deliveryNumber'), s('supplier'), s('reference')].filter(Boolean).join(' · ') || null;
    case 'delivery.arrived':
      return [s('deliveryNumber'), s('driver') ? `driver ${s('driver')}` : null, s('vehicle')].filter(Boolean).join(' · ') || null;
    case 'delivery.received':
      return [s('deliveryNumber'), s('grn') ? `GRN ${s('grn')}` : null, s('note')].filter(Boolean).join(' · ') || null;
    case 'delivery.left':
      return [s('deliveryNumber'), meta.received === false ? 'not received' : null, s('reason')].filter(Boolean).join(' · ') || null;
    case 'security.follow_up':
      return s('note');
    case 'visit.extended':
      return `By ${s('extra') ?? ''} (stay now ${s('newStay') ?? ''})${s('reason') ? ` — ${s('reason')}` : ''}`;
    case 'visit.checked_out':
      return s('duration') ? `On premises for ${s('duration')}` : null;
    case 'visit.overdue':
    case 'exit_pass.overdue':
      return s('over') ? `Over by ${s('over')}` : null;
    case 'visit.cancelled':
    case 'exit_pass.declined':
    case 'exit_pass.cancelled':
      return s('reason') ? `Reason: ${s('reason')}` : null;
    case 'exit_pass.requested':
      return Array.isArray(meta.people) ? `For ${(meta.people as string[]).join(', ')} — ${meta.returning ? 'returning' : 'not returning'}` : null;
    case 'exit_pass.gate_in':
      return [s('away') ? `Away ${s('away')}` : null, s('late') ? `late by ${s('late')}` : null].filter(Boolean).join(' · ') || null;
    case 'vehicle.gate_exit':
      return [s('exitNumber'), s('number'), s('collectedBy') ?? s('driver') ? `collected by ${s('collectedBy') ?? s('driver')}` : null].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}
