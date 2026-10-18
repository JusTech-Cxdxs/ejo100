import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /service — pasted links included. (Service Centre staff, the Warranty Manager, administrators.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['service.view'], '/service');
  return children;
}
