import { NextResponse } from 'next/server';
import { currentCustomer } from '@/lib/customer-portal/session';
import { loadNotices } from '@/lib/customer-portal/notifications';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

/**
 * The notification bell's heartbeat (polled every 30 s while the tab is
 * visible): the unread count and the latest few items. Signed-out → 401.
 */
export async function GET() {
  const me = await currentCustomer();
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: NO_STORE });
  try {
    const notices = await loadNotices(me);
    const unread = notices.filter((n) => !n.read);
    return NextResponse.json(
      {
        unread: unread.length,
        latestKeys: unread.slice(0, 10).map((n) => n.key),
        items: notices.slice(0, 8).map((n) => ({ key: n.key, title: n.title, body: n.body, at: n.at.toISOString(), href: n.href, icon: n.icon, tone: n.tone, read: n.read })),
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
