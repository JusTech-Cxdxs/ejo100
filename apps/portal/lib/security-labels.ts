import { humanizeAction } from '@/lib/humanize-action';

/** Readable audit wording for every Security action. */
export const SECURITY_ACTION_LABEL: Record<string, string> = {
  'visit.pre_registered': 'Visitor pre-registered',
  'visit.arrived': 'Recorded at the gate — pass issued',
  'visit.checked_in': 'Checked in at the gate — pass issued',
  'visit.received': 'Received at reception — host told',
  'visit.extended': 'Stay extended',
  'visit.checked_out': 'Checked out',
  'visit.cancelled': 'Visit cancelled',
  'visit.overdue': 'Stayed longer than expected — Chief Security Officer told',
  'exit_pass.requested': 'Exit pass requested',
  'exit_pass.head_authorised': 'Authorised by the Department Head',
  'exit_pass.manager_approved': 'Approved by the Manager',
  'exit_pass.declined': 'Declined',
  'exit_pass.cancelled': 'Cancelled',
  'exit_pass.gate_out': 'Time out recorded at the gate',
  'exit_pass.gate_in': 'Time in recorded at the gate',
  'exit_pass.overdue': 'Not back on time — Chief Security Officer told',
  'security.email_sent': 'Email sent',
  'security.email_failed': 'Email could not be sent',
  'vehicle.gate_exit': 'Vehicle left through the gate',
};

export function securityActionLabel(action: string): string {
  return SECURITY_ACTION_LABEL[action] ?? humanizeAction(action);
}

/** One readable line of detail for an entry, or null. */
export function securityActionDetail(action: string, meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const s = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : null);
  switch (action) {
    case 'security.email_sent':
    case 'security.email_failed':
      return `To ${s('to') ?? 'recipient'} — ${s('subject') ?? ''}${s('error') ? ` (${s('error')})` : ''}`;
    case 'visit.checked_in':
    case 'visit.arrived':
      return [s('passNumber') ? `Pass ${s('passNumber')}` : null, s('vehicle') ? (s('vehicle') === 'On foot' ? 'on foot' : `vehicle ${s('vehicle')}`) : null].filter(Boolean).join(' · ') || null;
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
      return [s('exitNumber'), s('number'), s('driver') ? `driven by ${s('driver')}` : null].filter(Boolean).join(' · ') || null;
    default:
      return null;
  }
}
