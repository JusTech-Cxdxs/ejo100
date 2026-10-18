import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadNotices } from '@/lib/customer-portal/notifications';
import { firstName, initials } from '@/lib/customer-portal/format';
import { PortalShell } from '@/components/customer/PortalShell';
import { loadDealerAccount } from '@/lib/customer-portal/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Customer portal', template: '%s · Customer portal' },
  robots: { index: false, follow: false },
};

function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Every page under /customer-portal/dashboard runs through here first: the
 * session and the customer's isActive flag are checked on EVERY request
 * (middleware only checks that a cookie exists). Anyone else is sent to
 * sign in.
 */
export default async function CustomerDashboardLayout({ children }: { children: ReactNode }) {
  const me = await requireCustomer();
  let unread = 0;
  try {
    unread = (await loadNotices(me)).filter((n) => !n.read).length;
  } catch {
    unread = 0;
  }
  return (
    <PortalShell
      who={{ fullName: me.fullName, firstName: firstName(me.fullName), email: me.email, initials: initials(me.fullName), greeting: greeting() }}
      initialUnread={unread}
      dealer={Boolean(await loadDealerAccount(me.id))}
    >
      {children}
    </PortalShell>
  );
}
