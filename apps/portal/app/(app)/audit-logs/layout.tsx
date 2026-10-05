import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for everything under /audit-logs — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('audit.view', '/audit-logs');
  return children;
}
