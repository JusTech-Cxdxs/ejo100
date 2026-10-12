import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Broadcast analytics are for the people who send broadcasts — pasted links included. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('notifications.broadcast.send', '/notifications/broadcasts/analytics');
  return children;
}
