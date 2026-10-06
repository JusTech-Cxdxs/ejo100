import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /security/vehicles — the Security desk (security staff, reception, managers). */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['security.view'], '/security/vehicles');
  return children;
}
