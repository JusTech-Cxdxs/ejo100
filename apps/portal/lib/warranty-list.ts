/**
 * The warranty register's filters, shared by the page and its export so the
 * file always holds exactly what the list shows. Pure.
 */
import type { WarrantyCoverageState } from './warranty-state';

export const WARRANTY_LIST_FILTER = ['all', 'covered', 'expiring', 'pending', 'expired', 'inactive', 'asset', 'part', 'reminder'] as const;
export type WarrantyListFilter = (typeof WARRANTY_LIST_FILTER)[number];

export const WARRANTY_FILTER_STATES: Record<Exclude<WarrantyListFilter, 'all' | 'asset' | 'part' | 'reminder'>, WarrantyCoverageState[]> = {
  covered: ['COVERED', 'EXPIRING_SOON'],
  expiring: ['EXPIRING_SOON'],
  pending: ['PENDING_VERIFICATION'],
  expired: ['EXPIRED'],
  inactive: ['SUSPENDED', 'VOID', 'TRANSFERRED'],
};

export function parseWarrantyFilter(raw: unknown): WarrantyListFilter {
  return (WARRANTY_LIST_FILTER as readonly string[]).includes(String(raw)) ? (raw as WarrantyListFilter) : 'all';
}

export function warrantyMatchesFilter(filter: WarrantyListFilter, r: { kind: string; state: WarrantyCoverageState; reminderDue: boolean }): boolean {
  if (filter === 'all') return true;
  if (filter === 'reminder') return r.reminderDue;
  if (filter === 'asset') return r.kind === 'ASSET';
  if (filter === 'part') return r.kind === 'PART';
  return WARRANTY_FILTER_STATES[filter].includes(r.state);
}
