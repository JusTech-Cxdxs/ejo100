/**
 * The website's own visitor counting: anonymous paths (ids and tokens masked),
 * bots ignored, devices, referrers, time on page, and Enyo's one gentle
 * question per visit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanPath, cleanSeconds, deviceOf, isBot, lagosDay, makeLimiter, referrerHost, visitorHash } from '../lib/analytics/visits-core';
import { nudgeFor } from '../lib/enyo/nudge';

test('paths keep no query, no tokens and no ids', () => {
  assert.equal(cleanPath('/services?utm=x#top'), '/services');
  assert.equal(cleanPath('/track/8f2c9a71b3d44e0fa1c2'), '/track/:id');
  assert.equal(cleanPath('/customer-portal/jobs/clx9abc12def'), '/customer-portal/jobs/:id');
  assert.equal(cleanPath('/news/2026'), '/news/2026');
  assert.equal(cleanPath('/x/1234567'), '/x/:id');
  assert.equal(cleanPath('/me/someone@mail.com'), '/me/:id');
  assert.equal(cleanPath('/About/'), '/about');
  assert.equal(cleanPath('/'), '/');
  assert.equal(cleanPath('/api/enyo/chat'), null);
  assert.equal(cleanPath('//evil.com'), null);
  assert.equal(cleanPath('https://x.com/'), null);
  assert.equal(cleanPath(42), null);
});

test('bots and empty agents are not counted; devices are told apart', () => {
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isBot('HeadlessChrome/120'), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'), false);
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0)'), 'desktop');
});

test('referrer is another site\'s host only', () => {
  assert.equal(referrerHost('https://www.google.com/search?q=x', 'example.com'), 'google.com');
  assert.equal(referrerHost('https://example.com/about', 'example.com:443'), null);
  assert.equal(referrerHost('', 'example.com'), null);
  assert.equal(referrerHost('not a url', 'example.com'), null);
});

test('time on page is whole seconds, 0–30 minutes', () => {
  assert.equal(cleanSeconds(12.4), 12);
  assert.equal(cleanSeconds(-5), 0);
  assert.equal(cleanSeconds(99999), 1800);
  assert.equal(cleanSeconds('abc'), 0);
});

test('the visitor is stored as a keyed hash, the day is Lagos', () => {
  const a = visitorHash('v1.abc', 'k1');
  assert.equal(a.length, 32);
  assert.equal(a, visitorHash('v1.abc', 'k1'));
  assert.notEqual(a, visitorHash('v1.abc', 'k2'));
  assert.equal(lagosDay(new Date('2026-10-17T23:30:00Z')).toISOString(), '2026-10-18T00:00:00.000Z');
});

test('the limiter allows a burst per minute, then refuses', () => {
  const ok = makeLimiter(3);
  assert.deepEqual([ok('a', 0), ok('a', 1), ok('a', 2), ok('a', 3), ok('b', 3), ok('a', 61_000)], [true, true, true, false, true, true]);
});

test('Enyo offers one page-fitting question, never on the customer portal', () => {
  assert.match(nudgeFor('/services/maintenance')!.ask, /services/i);
  assert.match(nudgeFor('/contact')!.ask, /call me/i);
  assert.equal(nudgeFor('/customer-portal/jobs'), null);
  assert.equal(nudgeFor('/privacy'), null);
  assert.ok(nudgeFor('/somewhere-else'));
});

test('the beacon is same-site, rate-limited, ignores bots and Do Not Track, and never breaks a page', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'visit', 'route.ts'), 'utf8');
  for (const must of ['originAllowed(', 'isBot(ua)', "'dnt'", "'sec-gpc'", 'limit(', 'visitorHash(key)', 'cleanPath(', "SITE_VISITS === 'off'", 'return none();']) assert.ok(src.includes(must), must);
  // The internet address is only used (hashed) for the limiter, never stored.
  assert.doesNotMatch(src.slice(src.indexOf('prisma.siteVisit.create')), /ip/i);
  const tracker = readFileSync(join(__dirname, '..', '..', 'components', 'site', 'VisitTracker.tsx'), 'utf8');
  assert.ok(tracker.includes('doNotTrack') && tracker.includes("visibilityState === 'hidden'"));
});
