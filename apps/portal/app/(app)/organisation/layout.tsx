import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for everything under /organisation — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('admin.organisation.manage', '/organisation');
  return children;
}
