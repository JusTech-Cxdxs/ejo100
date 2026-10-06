import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for /inventory/analytics — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('analytics.inventory.view', '/inventory/analytics');
  return children;
}
