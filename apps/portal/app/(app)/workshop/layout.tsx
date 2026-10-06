import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /workshop — pasted links included. (Workshop staff, Finance, Store, Warranty, management.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['workshop.view'], '/workshop');
  return children;
}
