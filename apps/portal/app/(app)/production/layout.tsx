import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /production — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['production.view'], '/production');
  return children;
}
