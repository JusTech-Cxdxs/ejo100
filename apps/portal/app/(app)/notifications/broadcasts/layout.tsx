import type { ReactNode } from 'react';
import { guardPage } from '@/lib/authz/server';

/** Managing broadcasts (the list, a broadcast's page, new) is for the people
 * who send them — everyone else reads theirs in the notification centre. */
export default async function Guard({ children }: { children: ReactNode }) {
  await guardPage('notifications.broadcast.send', '/notifications/broadcasts');
  return children;
}
