/**
 * Page-view beacon for the website's own visitor report (portal → IT control
 * room → Website visitors). Anonymous and cookie-less: the visitor is a keyed
 * hash of address + browser + day (it changes daily and cannot be reversed;
 * the address itself is never stored), no query string, ids in paths masked,
 * never the customer portal. Same-site only, rate-limited, bots and Do Not
 * Track ignored; never fails a page.
 *
 *   { event: 'view', path, ref, session }  → { id }
 *   { event: 'leave', id, seconds }         → 204
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@ejo/database';
import { siteOrganisation } from '@/lib/enyo/settings';
import { VISITOR_COOKIE, isPlainId, isVisitorKey, originAllowed } from '@/lib/enyo/rules';
import { websiteBaseUrl } from '@/lib/site-urls';
import { ipHash } from '@/lib/enyo/conversation';
import { cleanPath, cleanSeconds, deviceOf, isBot, lagosDay, makeLimiter, referrerHost, visitKey, visitorHash } from '@/lib/analytics/visits-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limit = makeLimiter(90);
const none = () => new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/** The address the hosting platform saw (Vercel sets x-real-ip; the first forwarded hop otherwise). */
function addressOf(h: Headers): string {
  return (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? '').trim().slice(0, 64) || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.SITE_VISITS === 'off') return none();
    const key = visitKey();
    if (!key) return none();
    // Production: only this site's configured address. Previews and local: the address it was reached on.
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
    const allowed = process.env.VERCEL_ENV === 'production' ? [websiteBaseUrl()] : [websiteBaseUrl(), host ? `${proto}://${host}` : null];
    if (!originAllowed(req.headers.get('origin'), allowed)) return none();
    const ua = req.headers.get('user-agent');
    if (isBot(ua) || req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1') return none();
    const address = addressOf(req.headers);
    if (!limit(ipHash(address) ?? 'unknown')) return none();
    const raw = (await req.text()).slice(0, 2000);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return none(); }

    const today = lagosDay();
    const hash = visitorHash(address, ua ?? '', today, key);

    if (body.event === 'leave') {
      if (!isPlainId(body.id)) return none();
      const seconds = cleanSeconds(body.seconds);
      const since = new Date(Date.now() - 3 * 3_600_000);
      const visit = await prisma.siteVisit.findFirst({ where: { id: body.id, visitorHash: hash, startedAt: { gte: since } }, select: { id: true, organisationId: true } });
      if (!visit) return none();
      // Only a yes/no: did this browser talk to Enyo in the last day? (Its Enyo cookie is read, never stored here.)
      const enyoKey = req.cookies.get(VISITOR_COOKIE)?.value;
      const chatted = isVisitorKey(enyoKey)
        ? await prisma.enyoConversation.count({ where: { organisationId: visit.organisationId, visitorKey: enyoKey, updatedAt: { gte: new Date(Date.now() - 86_400_000) } } }).then((n) => n > 0).catch(() => false)
        : false;
      await prisma.siteVisit.update({ where: { id: visit.id }, data: { durationSec: seconds, ...(chatted ? { chatted: true } : {}) } });
      return none();
    }

    if (body.event !== 'view') return none();
    const path = cleanPath(body.path);
    if (!path) return none();
    const org = await siteOrganisation();
    if (!org) return none();
    const session = typeof body.session === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(body.session) ? body.session : 'none';
    const row = await prisma.siteVisit.create({
      data: { organisationId: org.id, day: today, visitorHash: hash, sessionId: session, path, referrerHost: referrerHost(body.ref, host), device: deviceOf(ua) },
      select: { id: true },
    });
    return NextResponse.json({ id: row.id }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    // Counting visitors never breaks the website (e.g. a database a version behind).
    return none();
  }
}
