import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /inventory — pasted links included. (Store, Workshop supervisors and technicians, Finance, management.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['store.view'], '/inventory');
  return children;
}
