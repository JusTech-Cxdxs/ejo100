import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for everything under /module-registry — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('admin.settings.manage', '/module-registry');
  return children;
}
