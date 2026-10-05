import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for everything under /analytics — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('analytics.business.view', '/analytics');
  return children;
}
