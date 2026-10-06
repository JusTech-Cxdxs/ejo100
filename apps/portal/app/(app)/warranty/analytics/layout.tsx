import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for /warranty/analytics — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('analytics.warranty.view', '/warranty/analytics');
  return children;
}
