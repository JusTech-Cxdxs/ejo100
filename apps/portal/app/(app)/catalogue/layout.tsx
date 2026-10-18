import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /catalogue — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['catalogue.view'], '/catalogue');
  return children;
}
