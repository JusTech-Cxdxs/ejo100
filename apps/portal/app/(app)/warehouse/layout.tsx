import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /warehouse — pasted links included. (The warehouse teams, dispatch, sales, production, procurement, management.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['warehouse.view'], '/warehouse');
  return children;
}
