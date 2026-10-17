/**
 * Page-view beacon for the website's own visitor report (Settings → IT →
 * Website). Anonymous: the random visitor cookie (the same one Enyo uses) is
 * stored only as a keyed hash; no address, no query string, ids in paths are
 * masked. Same-site only, rate-limited, bots ignored; never fails a page.
 *
 *   { event: 'view', path, ref, session }  → { id }
 *   { event: 'leave', id, seconds }         → 204
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@ejo/database';
import { siteOrganisation } from '@/lib/enyo/settings';
import { VISITOR_COOKIE, VISITOR_COOKIE_DAYS, isPlainId, isVisitorKey, newVisitorKey, originAllowed } from '@/lib/enyo/rules';
import { websiteBaseUrl } from '@/lib/site-urls';
import { clientIp } from '@/lib/customer-audit';
import { ipHash } from '@/lib/enyo/conversation';
import { cleanPath, cleanSeconds, deviceOf, isBot, lagosDay, makeLimiter, referrerHost, visitorHash } from '@/lib/analytics/visits-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const limit = makeLimiter(90);
const none = () => new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export async function POST(req: NextRequest) {
  try {
    if (process.env.SITE_VISITS === 'off') return none();
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '');
    if (!originAllowed(req.headers.get('origin'), [websiteBaseUrl(), host ? `${proto}://${host}` : null])) return none();
    const ua = req.headers.get('user-agent');
    if (isBot(ua) || req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1') return none();
    if (!limit(ipHash(clientIp(req.headers)) ?? 'unknown')) return none();
    const raw = (await req.text()).slice(0, 2000);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return none(); }

    const cookie = req.cookies.get(VISITOR_COOKIE)?.value;
    const known = isVisitorKey(cookie);
    const key = known ? cookie! : newVisitorKey();
    const hash = visitorHash(key);

    if (body.event === 'leave') {
      if (!isPlainId(body.id)) return none();
      const seconds = cleanSeconds(body.seconds);
      const since = new Date(Date.now() - 3 * 3_600_000);
      const visit = await prisma.siteVisit.findFirst({ where: { id: body.id, visitorHash: hash, startedAt: { gte: since } }, select: { id: true, organisationId: true, day: true } });
      if (!visit) return none();
      // Did this visitor talk to Enyo today (as a visitor)?
      const chatted = await prisma.enyoConversation.count({ where: { organisationId: visit.organisationId, visitorKey: key, updatedAt: { gte: visit.day } } }).then((n) => n > 0).catch(() => false);
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
      data: { organisationId: org.id, day: lagosDay(), visitorHash: hash, sessionId: session, path, referrerHost: referrerHost(body.ref, host), device: deviceOf(ua) },
      select: { id: true },
    });
    const res = NextResponse.json({ id: row.id }, { headers: { 'cache-control': 'no-store' } });
    if (!known) res.cookies.set(VISITOR_COOKIE, key, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VISITOR_COOKIE_DAYS * 86_400 });
    return res;
  } catch {
    // Counting visitors never breaks the website (e.g. a database a version behind).
    return none();
  }
}
