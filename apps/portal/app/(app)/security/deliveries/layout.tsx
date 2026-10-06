import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /security/deliveries — the gate and the Store (who receives the goods). */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['security.view', 'store.grn.record'], '/security/deliveries');
  return children;
}
