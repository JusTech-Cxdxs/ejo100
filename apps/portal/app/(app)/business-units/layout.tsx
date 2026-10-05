import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Server-side guard for everything under /business-units — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('admin.structure.manage', '/business-units');
  return children;
}
