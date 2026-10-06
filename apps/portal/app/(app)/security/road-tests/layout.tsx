import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /security/road-tests — the gate, and the workshop people whose vehicle is being tested. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['security.view', 'workshop.job_card.view'], '/security/road-tests');
  return children;
}
