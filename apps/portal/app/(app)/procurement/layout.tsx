import type { ReactNode } from 'react';
import { guardAnyPage } from '@/lib/authz/server';

/** Server-side guard for /procurement — pasted links included. (Procurement, planning, the warehouses, Finance, management.) */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardAnyPage(['procurement.view'], '/procurement');
  return children;
}
