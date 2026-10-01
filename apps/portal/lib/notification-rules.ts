import { dayKind, lagosYmd } from '@/lib/nigeria-calendar';

/**
 * Notification rules — plain functions shared by the server, the pages and
 * the tests. Nothing here touches the database.
 */

/** Areas of the business and the record types that belong to each. */
export const AREAS: Record<string, string[]> = {
  WORKSHOP: ['JobCard', 'VehicleService', 'CustomerVehicle', 'Customer', 'VehicleInspection', 'EstimateLineItem', 'ServiceEstimateLineItem', 'RoadTestPermit'],
  STORE: ['Part', 'PartType', 'PartCategory', 'PartRequestSlip', 'ExternalProcurementRequest', 'GoodsReceipt', 'PricingAlert', 'GateDelivery'],
  WARRANTY: ['Warranty', 'WarrantyPolicy', 'WarrantyProvider', 'WarrantyClaim'],
  SECURITY: ['Visit', 'ExitPass', 'VehicleGateExit', 'RoadTestPermit', 'SecurityIncident', 'GateDelivery', 'ContractorPass'],
  SCHEDULING: ['Appointment', 'MeetingRoom', 'CalendarDelegate'],
};

/** Heads see EVERYTHING in their area; administrators see everything. */
export const ROLE_AREAS: Record<string, string[]> = {
  'workshop-manager': ['WORKSHOP'],
  'workshop-supervisor': ['WORKSHOP'],
  'store-manager': ['STORE'],
  'warranty-hod': ['WARRANTY'],
  'chief-security-officer': ['SECURITY'],
  'scheduling-admin': ['SCHEDULING'],
};
export const ALL_ACTIVITY_ROLES = ['administrator'];

/** Bookkeeping entries that are never shown as activity. */
export const HIDDEN_ACTIONS = ['security.email_sent', 'security.email_failed', 'appointment.reminder_sent'];

export function entityTypesForRoles(slugs: string[]): string[] | 'ALL' {
  if (slugs.some((s) => ALL_ACTIVITY_ROLES.includes(s))) return 'ALL';
  const types = new Set<string>();
  for (const s of slugs) for (const area of ROLE_AREAS[s] ?? []) for (const t of AREAS[area] ?? []) types.add(t);
  return [...types];
}

/** The exact page of a record. */
export function recordUrl(entityType: string, id: string): string {
  const map: Record<string, string> = {
    JobCard: `/workshop/job-cards/${id}`,
    VehicleService: `/workshop/vehicle-service/${id}`,
    CustomerVehicle: `/workshop/vehicles/${id}`,
    Customer: '/workshop/customers',
    PartRequestSlip: `/workshop/parts-requests/${id}`,
    ExternalProcurementRequest: `/workshop/external-procurement/${id}`,
    Part: `/inventory/parts/${id}`,
    GoodsReceipt: `/inventory/goods-receipts/${id}`,
    PartType: '/inventory/part-types',
    PartCategory: '/inventory',
    PricingAlert: '/inventory/pricing',
    EstimateLineItem: '/workshop',
    ServiceEstimateLineItem: '/workshop',
    VehicleInspection: '/workshop',
    Warranty: `/warranty/${id}`,
    WarrantyClaim: `/warranty/claims/${id}`,
    WarrantyPolicy: `/warranty/policies/${id}`,
    WarrantyProvider: `/warranty/providers/${id}`,
    Visit: `/security/visitors/${id}`,
    ExitPass: `/security/exit-passes/${id}`,
    VehicleGateExit: `/security/vehicles/exits/${id}`,
    RoadTestPermit: `/security/road-tests/${id}`,
    SecurityIncident: `/security/incidents/${id}`,
    GateDelivery: `/security/deliveries/${id}`,
    ContractorPass: `/security/contractors/${id}`,
    Appointment: `/schedule/${id}`,
    MeetingRoom: '/schedule/rooms',
    CalendarDelegate: '/schedule/aides',
    Broadcast: `/notifications/broadcasts/${id}`,
    Announcement: '/notifications/broadcasts',
    Organisation: '/organisation',
    Branch: '/branches',
  };
  return map[entityType] ?? '/audit-logs';
}

export function areaOf(entityType: string): string {
  for (const [area, types] of Object.entries(AREAS)) if (types.includes(entityType)) return area;
  return 'SYSTEM';
}

export const AREA_LABEL: Record<string, string> = { WORKSHOP: 'Workshop', STORE: 'Store', WARRANTY: 'Warranty', SECURITY: 'Security', SCHEDULING: 'Scheduling', SYSTEM: 'System' };

// ── Broadcasts ──────────────────────────────────────────────────────────

export type CategoryMeta = { label: string; icon: string; chip: string; bar: string; emailColor: string; heading: string };
export const BROADCAST_CATEGORY: Record<string, CategoryMeta> = {
  NEWS: { label: 'News', icon: '📰', chip: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]', bar: 'border-l-[var(--ejo-info)]', emailColor: '#2563EB', heading: 'News' },
  ANNOUNCEMENT: { label: 'Announcement', icon: '📢', chip: 'bg-[var(--ejo-primary)]/15 text-[var(--ejo-primary)]', bar: 'border-l-[var(--ejo-primary)]', emailColor: '#16A34A', heading: 'Announcement' },
  IMPORTANT: { label: 'Important', icon: '⭐', chip: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]', bar: 'border-l-[var(--ejo-warning)]', emailColor: '#D97706', heading: 'Important notice' },
  URGENT: { label: 'Urgent', icon: '⚠️', chip: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]', bar: 'border-l-[var(--ejo-error)]', emailColor: '#DC2626', heading: 'Urgent' },
  SECURITY_ALERT: { label: 'Security alert', icon: '🚨', chip: 'bg-[var(--ejo-error)]/20 text-[var(--ejo-error)]', bar: 'border-l-[var(--ejo-error)]', emailColor: '#B91C1C', heading: 'Security alert' },
  MAINTENANCE: { label: 'Maintenance', icon: '🛠️', chip: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]', bar: 'border-l-[var(--ejo-text-muted)]', emailColor: '#475569', heading: 'Planned maintenance' },
  GREETING: { label: 'Greeting', icon: '🎉', chip: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]', bar: 'border-l-[var(--ejo-success)]', emailColor: '#059669', heading: 'Greetings' },
};
export const BROADCAST_CATEGORIES = Object.keys(BROADCAST_CATEGORY);

/** How long a broadcast runs. */
export const DURATIONS: { value: string; label: string }[] = [
  { value: 'm5', label: '5 minutes' }, { value: 'm10', label: '10 minutes' }, { value: 'm20', label: '20 minutes' }, { value: 'm30', label: '30 minutes' },
  { value: 'h1', label: '1 hour' }, { value: 'h2', label: '2 hours' }, { value: 'h4', label: '4 hours' }, { value: 'h8', label: '8 hours' }, { value: 'h12', label: '12 hours' },
  { value: 'w1', label: '1 working day' }, { value: 'w2', label: '2 working days' }, { value: 'w3', label: '3 working days' }, { value: 'w5', label: '5 working days' }, { value: 'w10', label: '10 working days' },
  { value: 'd7', label: '1 week' }, { value: 'd30', label: '1 month (30 days)' },
  { value: 'none', label: 'Until stopped' },
];

/** End of a broadcast that starts at `start` and runs for `code`. Working
 * days skip weekends and Nigerian public holidays and end at 5 pm Lagos. */
export function broadcastEnd(start: Date, code: string): Date | null {
  if (code === 'none') return null;
  const n = Number(code.slice(1));
  if (!Number.isInteger(n) || n < 1) throw new Error('Unknown duration.');
  const kind = code[0];
  if (kind === 'm') return new Date(start.getTime() + n * 60000);
  if (kind === 'h') return new Date(start.getTime() + n * 3600000);
  if (kind === 'd') return new Date(start.getTime() + n * 86400000);
  if (kind === 'w') {
    let day = lagosYmd(start);
    let counted = dayKind(day).working ? 1 : 0;
    while (counted < n) {
      const d = new Date(`${day}T12:00:00+01:00`);
      d.setUTCDate(d.getUTCDate() + 1);
      day = d.toISOString().slice(0, 10);
      if (dayKind(day).working) counted += 1;
    }
    return new Date(`${day}T17:00:00+01:00`);
  }
  throw new Error('Unknown duration.');
}

export function durationLabel(code: string): string {
  return DURATIONS.find((d) => d.value === code)?.label ?? code;
}

export type BroadcastState = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'STOPPED';
export function broadcastState(b: { isActive: boolean; startsAt: Date; endsAt: Date | null; stoppedAt: Date | null }, now: Date = new Date()): BroadcastState {
  if (!b.isActive) return b.stoppedAt ? 'STOPPED' : 'ENDED';
  if (+new Date(b.startsAt) > +now) return 'SCHEDULED';
  if (b.endsAt && +new Date(b.endsAt) <= +now) return 'ENDED';
  return 'LIVE';
}
export const BROADCAST_STATE_LABEL: Record<BroadcastState, string> = { SCHEDULED: 'Scheduled', LIVE: 'Live', ENDED: 'Ended', STOPPED: 'Stopped' };

/** Does this broadcast reach this person? */
export function reaches(b: { audience: string; audienceIds: string[] }, u: { branchId: string | null; departmentId: string | null; roleSlugs: string[] }): boolean {
  if (b.audience === 'ALL') return true;
  if (b.audience === 'BRANCH') return Boolean(u.branchId && b.audienceIds.includes(u.branchId));
  if (b.audience === 'DEPARTMENT') return Boolean(u.departmentId && b.audienceIds.includes(u.departmentId));
  if (b.audience === 'ROLE') return u.roleSlugs.some((r) => b.audienceIds.includes(r));
  return false;
}
