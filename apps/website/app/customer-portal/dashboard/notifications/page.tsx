import { requireCustomer } from '@/lib/customer-portal/session';
import { loadNotices } from '@/lib/customer-portal/notifications';
import { timeAgo } from '@/lib/customer-portal/format';
import { PageHero } from '@/components/customer/ui';
import { NoticeList } from '@/components/customer/NoticeList';

export const metadata = { title: 'Notifications' };

/** Everything that happened on the customer's account, plus announcements. */
export default async function NotificationsPage() {
  const me = await requireCustomer();
  const notices = await loadNotices(me);
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Notifications" icon="bell" title="Updates for you" subtitle="Estimates, progress, payments, collection and warranty news — newest first. You’ll hear a soft chime when something new arrives (you can turn it off in Profile & settings)." />
      <NoticeList
        initial={notices.map((n) => ({ key: n.key, title: n.title, body: n.body, at: n.at.toISOString(), when: timeAgo(n.at, now), href: n.href, icon: n.icon, tone: n.tone, read: n.read, broadcast: n.key.startsWith('bc:') }))}
      />
    </div>
  );
}
