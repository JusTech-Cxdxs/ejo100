import { allows } from '@/lib/authz/server';
import { LoadingLink } from './LoadingLink';

/**
 * A Job Card / Vehicle Service number: a link for people who may open the
 * record (workshop, finance, store, management), plain text for everyone
 * else (e.g. the Security desk) — so no one is offered a page they cannot open.
 */
export async function JobRef({ kind, id, number, className }: { kind: 'JOB_CARD' | 'VEHICLE_SERVICE'; id: string; number: string; className?: string }) {
  if (!(await allows('workshop.job_card.view'))) return <span className={className?.replace(/text-\[var\(--ejo-primary\)\]|hover:underline/g, '')}>{number}</span>;
  return <LoadingLink href={kind === 'JOB_CARD' ? `/workshop/job-cards/${id}` : `/workshop/vehicle-service/${id}`} className={className}>{number}</LoadingLink>;
}

/** The href to a job's page, or null when this person may not open it. */
export async function jobHref(kind: 'JOB_CARD' | 'VEHICLE_SERVICE', id: string): Promise<string | null> {
  if (!(await allows('workshop.job_card.view'))) return null;
  return kind === 'JOB_CARD' ? `/workshop/job-cards/${id}` : `/workshop/vehicle-service/${id}`;
}
