/**
 * Data Exchange — when a finished import's staged file is released. Pure (see staging-server.ts).
 */
import { ENTITIES, isEntityKey } from './fields';

export const DEFAULT_STAGING_DAYS = 30;
/** The organisation's period in days (0 = never released automatically). */
export function stagingDays(setting: number | null | undefined): number {
  return setting === null || setting === undefined || !Number.isFinite(setting) ? DEFAULT_STAGING_DAYS : Math.max(0, Math.min(3650, Math.trunc(setting)));
}

export type ReleaseState = { releasable: boolean; why: string | null; dueAt: Date | null };

/** Whether an import's staged rows may be released now, and when they would be automatically. */
export function releaseState(job: { entity: string; status: string; completedAt: Date | null; signedOffAt: Date | null; rowsReleasedAt: Date | null }, days: number): ReleaseState {
  if (job.rowsReleasedAt) return { releasable: false, why: 'Already released.', dueAt: null };
  if (job.status !== 'COMPLETED' || !job.completedAt) return { releasable: false, why: 'Only a finished import’s file is released.', dueAt: null };
  const needsSignOff = isEntityKey(job.entity) && Boolean(ENTITIES[job.entity].financeSignOff);
  if (needsSignOff && !job.signedOffAt) return { releasable: false, why: 'Finance confirms the totals first.', dueAt: null };
  const from = needsSignOff && job.signedOffAt && +job.signedOffAt > +job.completedAt ? job.signedOffAt : job.completedAt;
  return { releasable: true, why: null, dueAt: days > 0 ? new Date(+from + days * 86_400_000) : null };
}
