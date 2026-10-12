import type { IconName } from './Icon';

/** An icon for each kind of thing that can need you, and each area of activity. */
export const ACTION_ICON: Record<string, IconName> = {
  PRICING_ALERT: 'tag', CANCELLATION_REQUEST: 'alert', CLOSE_REQUEST: 'check-circle', JOB_CARD_APPROVAL: 'clipboard', TECHNICIAN_ASSIGNMENT: 'wrench',
  VEHICLE_SERVICE_APPROVAL: 'droplet', WARRANTY: 'shield-check', SECURITY: 'lock', SCHEDULING: 'calendar', WORKFLOW: 'bolt',
};
export const AREA_ICON: Record<string, IconName> = { WORKSHOP: 'wrench', STORE: 'boxes', WARRANTY: 'shield-check', SECURITY: 'lock', SCHEDULING: 'calendar', SYSTEM: 'settings' };
/** Broadcast categories: meaning colours only (urgent red, important amber…). */
export const CATEGORY_ICON: Record<string, IconName> = { NEWS: 'file', ANNOUNCEMENT: 'megaphone', IMPORTANT: 'star', URGENT: 'alert', SECURITY_ALERT: 'shield', MAINTENANCE: 'wrench', GREETING: 'sparkles' };
export const CATEGORY_TILE: Record<string, string> = {
  URGENT: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]', SECURITY_ALERT: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]',
  IMPORTANT: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]', MAINTENANCE: 'bg-[var(--ejo-text-muted)]/12 text-[var(--ejo-text-muted)]',
};

