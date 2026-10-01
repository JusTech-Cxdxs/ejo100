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
