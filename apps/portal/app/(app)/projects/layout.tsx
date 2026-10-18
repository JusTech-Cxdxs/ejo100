import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /projects — pasted links included. (Project Managers, sales leadership, administrators.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['projects.view'], '/projects');
  return children;
}
