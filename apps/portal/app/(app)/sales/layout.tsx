import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /sales — pasted links included. (Sales, Billing, Finance, the store and management.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['sales.view'], '/sales');
  return children;
}
