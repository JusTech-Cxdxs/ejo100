// Records the product-video scenes against the running portal.
// Every frame is a full-resolution CDP screenshot with its own duration, so
// cursor moves and scrolls are stepped in "virtual time" (perfectly smooth at
// 30 fps) while page loads are captured in real time. Output per scene: a
// frames folder + an ffmpeg concat list, encoded straight to MP4.
//   node record.mjs <outDir> <scene-id>[,<scene-id>...] [--mobile]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const PASS = 'E2e-Test-Pass-2026!';
/** Demo sign-ins (the seeded e2e accounts, renamed for the video). */
const EMAIL = { frontdesk: 'funmi.adeyemi', supervisor: 'samuel.okafor', store: 'stella.nwosu', manager: 'mary.eze', security: 'suleiman.bello', scheduler: 'sade.balogun', care: 'chidi.okeke', executive: 'emeka.obi', admin: 'hannah.ibrahim', depthead: 'dayo.adebayo' };
const FPS = 30;
const JC1 = process.env.JC1; // the in-progress Job Card id
const [,, outDir, sceneList, flag] = process.argv;
const MOBILE = flag === '--mobile';
const VW = MOBILE ? 360 : 1920, VH = MOBILE ? 640 : 1080;
/** A cursor position as a fraction of the viewport (works on both layouts). */
const P = (fx, fy) => ({ x: Math.round(VW * fx), y: Math.round(VH * fy) });

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class Recorder {
  constructor(page, cdp, dir) {
    this.page = page; this.cdp = cdp; this.dir = dir; this.frames = []; this.i = 0;
    this.cur = { x: 300, y: 300 }; this.lastWall = 0; this.total = 0;
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  }
  async overlay(ring) {
    await this.page.evaluate(([c, mobile, ring]) => {
      let el = document.getElementById('__cur');
      if (!el) {
        el = document.createElement('div'); el.id = '__cur';
        el.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:0;top:0;will-change:transform;';
        el.innerHTML = mobile
          ? '<div style="width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(15,23,42,.28);border:2px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.25)"></div>'
          : '<svg width="30" height="36" viewBox="0 0 24 30" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M2 2 L2 23 L7.5 18 L11 27 L15 25.5 L11.5 17 L19 17 Z" fill="#fff" stroke="#0F172A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        document.documentElement.appendChild(el);
        const r = document.createElement('div'); r.id = '__ring';
        r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #22C55E;border-radius:12px;box-shadow:0 0 0 6px rgba(34,197,94,.25);opacity:0;left:0;top:0;';
        document.documentElement.appendChild(r);
      }
      el.style.transform = `translate(${c.x}px,${c.y}px) scale(${c.s ?? 1})`;
      const r = document.getElementById('__ring');
      if (ring) { r.style.opacity = String(ring.o); r.style.left = ring.x + 'px'; r.style.top = ring.y + 'px'; r.style.width = ring.w + 'px'; r.style.height = ring.h + 'px'; r.style.transform = `scale(${ring.s})`; }
      else r.style.opacity = '0';
    }, [this.cur, MOBILE, ring ?? null]).catch(() => {});
  }
  async snap(dur, ring) {
    await this.overlay(ring);
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true, ...(MOBILE ? { clip: { x: 0, y: 0, width: VW, height: VH, scale: 3 } } : {}) });
    const f = `f${String(this.i++).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(this.dir, f), Buffer.from(data, 'base64'));
    this.frames.push({ f, dur }); this.total += dur;
  }
  /** Real time: capture as fast as possible for `sec` seconds, each frame lasting as long as it took. */
  async hold(sec, ring) {
    const end = Date.now() + sec * 1000; let prev = Date.now();
    while (Date.now() < end) {
      await this.snap(0, ring);
      const now = Date.now(); this.frames[this.frames.length - 1].dur = Math.max(1 / FPS, (now - prev) / 1000); this.total += this.frames[this.frames.length - 1].dur; prev = now;
    }
  }
  /** Real time until `pred` is true (then a short settle). */
  async until(pred, max = 20) {
    const end = Date.now() + max * 1000; let prev = Date.now();
    while (Date.now() < end) {
      if (await pred().catch(() => false)) break;
      await this.snap(0); const now = Date.now(); this.frames[this.frames.length - 1].dur = Math.max(1 / FPS, (now - prev) / 1000); this.total += this.frames[this.frames.length - 1].dur; prev = now;
    }
  }
  async settle(sec = 0.8) {
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await this.hold(sec);
  }
  async moveTo(x, y, sec = 0.8) {
    const n = Math.max(2, Math.round(sec * FPS)); const sx = this.cur.x, sy = this.cur.y;
    for (let k = 1; k <= n; k++) {
      const t = ease(k / n); this.cur = { x: sx + (x - sx) * t, y: sy + (y - sy) * t };
      await this.page.mouse.move(this.cur.x, this.cur.y).catch(() => {});
      await this.snap(1 / FPS);
    }
  }
  async box(locator) {
    const l = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await l.first().waitFor({ state: 'visible', timeout: 15000 });
    await l.first().scrollIntoViewIfNeeded().catch(() => {});
    const b = await l.first().boundingBox(); if (!b) throw new Error('no box');
    return b;
  }
  /** Move to an element, light it up, click it. */
  async click(locator, { sec = 0.9, ringMs = 0.5, after = 0.6 } = {}) {
    const b = await this.box(locator);
    await this.moveTo(b.x + b.width / 2, b.y + b.height / 2, sec);
    const ring = { x: b.x - 6, y: b.y - 6, w: b.width + 12, h: b.height + 12 };
    const n = Math.round(ringMs * FPS);
    for (let k = 0; k < n; k++) { const t = k / n; await this.snap(1 / FPS, { ...ring, o: 1 - t * 0.3, s: 1.25 - 0.25 * ease(Math.min(1, t * 2)) }); }
    this.cur.s = 0.85; await this.snap(2 / FPS, { ...ring, o: 0.7, s: 1 });
    await this.page.mouse.click(this.cur.x, this.cur.y).catch(() => {});
    this.cur.s = 1; await this.snap(2 / FPS, { ...ring, o: 0.4, s: 1 });
    if (after) await this.hold(after);
  }
  async type(locator, text, { perChar = 0.055 } = {}) {
    await this.click(locator, { sec: 0.7, after: 0.2 });
    for (const ch of text) { await this.page.keyboard.type(ch); await this.snap(perChar); }
  }
  async scrollBy(dy, sec = 2) {
    const n = Math.round(sec * FPS); const start = await this.page.evaluate(() => window.scrollY);
    for (let k = 1; k <= n; k++) { await this.page.evaluate((y) => window.scrollTo(0, y), start + dy * ease(k / n)); await this.snap(1 / FPS); }
  }
  async scrollToTop(sec = 1.2) { const y = await this.page.evaluate(() => window.scrollY); await this.scrollBy(-y, sec); }
  async hover(locator, sec = 0.8, dwell = 0.5) { const b = await this.box(locator); await this.moveTo(b.x + b.width / 2, b.y + b.height / 2, sec); await this.hold(dwell); }
  async goto(url, { settle = 1.0 } = {}) {
    await this.page.goto(BASE + url, { waitUntil: 'commit' }).catch(() => {});
    await this.until(async () => (await this.page.evaluate(() => document.readyState)) === 'complete', 20);
    await this.settle(settle);
  }
  write(name) {
    const list = this.frames.map(({ f, dur }) => `file '${path.join(this.dir, f)}'\nduration ${dur.toFixed(4)}`).join('\n') + `\nfile '${path.join(this.dir, this.frames[this.frames.length - 1].f)}'\n`;
    fs.writeFileSync(path.join(this.dir, 'list.txt'), list);
    const out = path.join(path.dirname(this.dir), `${name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(this.dir, 'list.txt'), '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', out]);
    fs.rmSync(this.dir, { recursive: true, force: true });
    return { out, seconds: this.total };
  }
}

async function signIn(page, who) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Work email').fill(`${EMAIL[who]}@kewalram.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/dashboard/, { timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}
const link = (page, name) => page.getByRole('link', { name, exact: true });
const sideLink = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

const SCENES = {
  async '02-signin'(r, page) {
    await r.goto('/login', { settle: 1.2 });
    r.cur = P(0.78, 0.83);
    await r.hold(0.8);
    await r.type(page.getByLabel('Work email'), 'funmi.adeyemi@kewalram.com');
    await r.type(page.getByLabel('Password', { exact: true }), PASS, { perChar: 0.04 });
    await r.hold(0.5);
    await r.click(page.getByRole('button', { name: 'Sign in' }), { after: 0 });
    await r.until(async () => /dashboard/.test(page.url()) && (await page.getByRole('button', { name: 'Account menu' }).isVisible()), 40);
    await r.settle(3.0);
  },
  async '03-dashboard'(r, page) {
    await r.goto('/dashboard', { settle: 1.2 });
    r.cur = P(0.57, 0.65);
    await r.hover(page.getByText('Active Job Cards').first(), 1.0, 0.8);
    await r.hover(page.getByText('Vehicles registered').first(), 1.0, 0.8);
    await r.hover(page.getByText('Your brief from Enyo').first(), 0.9, 0.9);
    await r.scrollBy(520, 2.6); await r.hold(1.4);
    await r.scrollBy(520, 2.4); await r.hold(1.6);
    await r.scrollToTop(1.6); await r.hold(1.2);
  },
  async '04-crm'(r, page) {
    await r.goto('/dashboard', { settle: 0.6 });
    r.cur = P(0.47, 0.56);
    if (MOBILE) await r.goto('/crm', { settle: 1.6 });
    else { await r.click(sideLink(page, 'Customers'), { after: 0 }); await r.until(async () => /\/crm/.test(page.url()), 15); await r.settle(1.6); }
    await r.click(link(page, 'Adaeze Nwachukwu'), { after: 0 });
    await r.until(async () => /\/crm\/customers\//.test(page.url()), 15); await r.settle(2.2);
    await r.scrollBy(600, 3.0); await r.hold(2.0);
  },
  async '05-workshop'(r, page) {
    await r.goto('/workshop', { settle: 1.4 });
    r.cur = P(0.47, 0.65);
    await r.click(page.locator('main').getByRole('link', { name: /Job Cards/ }).first(), { after: 0 });
    await r.until(async () => /\/workshop\/job-cards/.test(page.url()), 15); await r.settle(1.8);
    await r.click(link(page, 'JC-2026-000001').first(), { after: 0 });
    await r.until(async () => /\/workshop\/job-cards\//.test(page.url()), 15); await r.settle(2.2);
    await r.scrollBy(700, 3.0); await r.hold(1.4);
    await r.scrollBy(800, 3.0); await r.hold(1.6);
  },
  async '06-print'(r, page) {
    await r.goto(`/print/job-cards/${JC1}/estimate`, { settle: 1.6 });
    r.cur = P(0.78, 0.74);
    await r.hover(page.getByText('Kewalram', { exact: true }).first(), 1.2, 0.6);
    await r.hover(page.getByText('Chanrai Group', { exact: true }).first(), 1.0, 0.8);
    await r.hover(page.getByText('Isolo Branch', { exact: true }).first(), 1.0, 0.6);
    await r.scrollBy(420, 2.6); await r.hold(1.4);
    await r.scrollBy(520, 2.6); await r.hold(1.6);
  },
  async '07-inventory'(r, page) {
    await r.goto('/inventory', { settle: 1.3 });
    r.cur = P(0.52, 0.74);
    await r.click(page.locator('main').getByRole('link', { name: /Parts Catalog/ }).first(), { after: 0 });
    await r.until(async () => /\/inventory\/parts/.test(page.url()), 15); await r.settle(1.6);
    await r.hover(page.getByText('Brake Pad Set (Front)').first(), 0.9, 0.7);
    await r.hover(page.getByText('Spark Plug (Iridium)').first(), 0.7, 0.6);
    await r.goto('/inventory/goods-receipts', { settle: 1.4 });
    await r.hover(page.locator('main table tbody tr').first(), 0.9, 0.9);
    await r.goto('/inventory/reorder', { settle: 2.2 });
  },
  async '08-approvals'(r, page) {
    await r.goto('/approvals', { settle: 1.5 });
    r.cur = P(0.52, 0.74);
    await r.click(page.locator('main').getByRole('link', { name: /Review needed/ }).first(), { after: 0 });
    await r.until(async () => /\/workshop\/job-cards\//.test(page.url()), 15); await r.settle(1.4);
    const approve = page.locator('#review-approval').getByRole('button', { name: 'Approve' });
    await r.click(approve, { sec: 1.0, after: 0 });
    await r.until(async () => await page.getByText(/Approved by/).first().isVisible(), 20);
    await r.settle(2.6);
  },
  async '09-security'(r, page) {
    await r.goto('/security', { settle: 1.6 });
    r.cur = P(0.52, 0.74);
    await r.scrollBy(380, 2.0); await r.hold(0.8);
    await r.goto('/security/on-premises', { settle: 1.4 });
    await r.hover(page.getByText('Ngozi Chukwu').first(), 0.9, 0.8);
    await r.goto('/security/vehicles-inside', { settle: 1.6 });
    await r.goto('/security/exit-passes', { settle: 1.0 });
    await r.click(page.locator('main').getByRole('link', { name: /All passes/ }).first(), { after: 0 });
    await r.until(async () => await page.locator('main').getByRole('link', { name: /EP-2026-/ }).first().isVisible(), 15); await r.hold(0.8);
    await r.click(page.locator('main').getByRole('link', { name: /EP-2026-/ }).first(), { after: 0 });
    await r.until(async () => /\/security\/exit-passes\//.test(page.url()), 15); await r.settle(1.8);
  },
  async '10-schedule'(r, page) {
    await r.goto('/schedule', { settle: 1.6 });
    r.cur = P(0.52, 0.74);
    await r.goto('/schedule/calendar', { settle: 1.4 });
    await r.click(page.locator('main').getByRole('link', { name: /^Next/ }).first(), { after: 0 });
    await r.until(async () => await page.getByText('Supplier pricing review').first().isVisible(), 15); await r.hold(0.6);
    await r.hover(page.getByText('Supplier pricing review').first(), 1.0, 1.0);
    await r.goto('/schedule/rooms', { settle: 1.8 });
  },
  async '11-support'(r, page) {
    await r.goto('/crm/support', { settle: 1.8 });
    r.cur = P(0.52, 0.74);
    await r.click(page.getByRole('link', { name: /AC still not cooling/ }).first(), { after: 0 });
    await r.until(async () => /\/crm\/support\//.test(page.url()), 15); await r.settle(2.2);
    await r.scrollBy(500, 2.6); await r.hold(1.6);
  },
  async '12-enyo'(r, page) {
    await r.goto('/dashboard', { settle: 1.0 });
    r.cur = P(0.62, 0.65);
    await r.click(page.getByRole('button', { name: 'Open Enyo' }), { after: 0.9 });
    await r.type(page.getByPlaceholder(/Ask Enyo/), 'Which job cards are waiting on someone today?', { perChar: 0.045 });
    await r.click(page.getByRole('button', { name: 'Send', exact: true }), { after: 0 });
    await r.until(async () => await page.getByText('Nothing is overdue').first().isVisible(), 30);
    await r.settle(3.2);
  },
  async '13-leadership'(r, page) {
    await r.goto('/headquarters', { settle: 1.6 });
    r.cur = P(0.52, 0.74);
    await r.scrollBy(450, 2.4); await r.hold(0.8);
    await r.goto('/analytics', { settle: 1.6 });
    await r.scrollBy(500, 2.4); await r.hold(0.8);
    await r.goto('/audit-logs', { settle: 2.2 });
  },
  async '14-mobile'(r, page) {
    await r.goto('/dashboard', { settle: 1.2 });
    r.cur = P(0.09, 0.46);
    await r.scrollBy(520, 2.2); await r.hold(0.6);
    await r.scrollToTop(1.0);
    await r.click(page.getByRole('button', { name: 'Open menu' }), { sec: 0.7, after: 0.8 });
    await r.click(page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Workshop', exact: true }), { sec: 0.7, after: 0 });
    await r.until(async () => /\/workshop/.test(page.url()), 15); await r.settle(1.2);
    await r.click(page.locator('main').getByRole('link', { name: /Job Cards/ }).first(), { sec: 0.7, after: 0 });
    await r.until(async () => /\/workshop\/job-cards/.test(page.url()), 15); await r.settle(1.4);
    await r.scrollBy(500, 2.0); await r.hold(1.0);
  },
};
const ROLE = { '02-signin': null, '03-dashboard': 'frontdesk', '04-crm': 'frontdesk', '05-workshop': 'supervisor', '06-print': 'supervisor', '07-inventory': 'store', '08-approvals': 'supervisor', '09-security': 'security', '10-schedule': 'scheduler', '11-support': 'care', '12-enyo': 'manager', '13-leadership': 'admin', '14-mobile': 'frontdesk' };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = {};
for (const id of sceneList.split(',')) {
  const ctx = await browser.newContext(MOBILE
    ? { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  if (ROLE[id]) await signIn(page, ROLE[id]);
  const cdp = await ctx.newCDPSession(page);
  const r = new Recorder(page, cdp, path.join(outDir, `${id}-frames`));
  const t0 = Date.now();
  try { await SCENES[id](r, page); }
  catch (e) { console.error(`scene ${id} failed:`, e.message); await page.screenshot({ path: path.join(outDir, `${id}-FAILED.jpg`) }).catch(() => {}); }
  const { out, seconds } = r.write(id);
  results[id] = seconds;
  console.log(`${id}: ${seconds.toFixed(1)}s of video, ${r.i} frames, captured in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
  await ctx.close();
}
fs.writeFileSync(path.join(outDir, `durations${MOBILE ? '-mobile' : ''}.json`), JSON.stringify({ ...(fs.existsSync(path.join(outDir, 'durations.json')) && !MOBILE ? JSON.parse(fs.readFileSync(path.join(outDir, 'durations.json'), 'utf8')) : {}), ...results }, null, 1));
await browser.close();
