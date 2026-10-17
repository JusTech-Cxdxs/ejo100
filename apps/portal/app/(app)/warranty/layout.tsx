import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /warranty — pasted links included. (Warranty staff, Manager, administrators.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['warranty.view'], '/warranty');
  return children;
}
