import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for everything under /countries — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('admin.structure.manage', '/countries');
  return children;
}
