import { test, expect, type Page } from '@playwright/test';
import { as, open, noSidewaysScroll } from './helpers';

/**
 * Enyo panel (staff portal), against the stand-in model in CI
 * (packages/enyo/testing/mock-llm.mjs; ENYO_LLM_BASE_URL=http://localhost:4010/v1).
 *
 * ENGINE: tests marked [engine] need the engine workstream's routes
 * (GET /api/enyo/status, POST /api/enyo/chat) and server actions
 * (lib/actions/enyo.ts: listConversations, getConversation, rateMessage)
 * connected in components/enyo/api.ts. Tests marked [panel] replace the chat
 * route in the browser (page.route), so they check the panel on its own:
 * Stop, draft cards and unsafe links.
 *
 * The mock answers "[[say:…]]" with exactly that text.
 */
test.describe.configure({ mode: 'serial' });

const launcher = (page: Page) => page.getByRole('button', { name: /^Open Enyo/ });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Enyo' });
const composer = (page: Page) => sheet(page).getByRole('textbox', { name: /^Ask / });

async function signedInWithEnyo(page: Page) {
  await as(page, 'receptionist');
  await open(page, '/dashboard');
  // [engine] the launcher appears only when /api/enyo/status says ready.
  await expect(launcher(page)).toBeVisible({ timeout: 20_000 });
}

/** A chat stream the panel reads, built in the test (no model involved). */
const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

test('[engine] opens with the launcher and with Ctrl+J; Esc closes and focus returns', async ({ page }) => {
  await signedInWithEnyo(page);
  await launcher(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(composer(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();

  await page.keyboard.press('Control+j');
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Control+j');
  await expect(sheet(page)).toBeHidden();

  // Tab stays inside the open sheet.
  await page.keyboard.press('Control+j');
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab');
  expect(await sheet(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
});

test('[engine] asks a question, streams the answer, keeps it in history, takes a thumbs up', async ({ page }) => {
  await signedInWithEnyo(page);
  await launcher(page).click();
  // Starter questions are offered on an empty chat.
  await expect(sheet(page).getByRole('button', { name: "What's waiting for me?" })).toBeVisible();

  const tag = `E2E-${Date.now().toString(36)}`;
  const chatRequest = page.waitForRequest((r) => r.url().endsWith('/api/enyo/chat') && r.method() === 'POST');
  await composer(page).fill(`[[say:Hello from the **mock** model, ${tag}.]]`);
  await page.keyboard.press('Enter');
  // The current page goes with the question.
  const body = (await chatRequest).postDataJSON() as { message: string; page?: string };
  expect(body.page).toBe('/dashboard');

  const answer = sheet(page).getByText(`Hello from the mock model, ${tag}.`);
  await expect(answer).toBeVisible({ timeout: 30_000 });
  // Markdown: bold is rendered, the marks are not shown.
  await expect(sheet(page).locator('strong', { hasText: 'mock' })).toBeVisible();
  await expect(sheet(page).getByText('**mock**')).toHaveCount(0);
  // Finished: the copy and rating buttons appear; nothing is still busy.
  await expect(sheet(page).getByRole('button', { name: 'Copy answer' })).toBeVisible();
  await expect(sheet(page).locator('[aria-busy="true"]')).toHaveCount(0);

  // Thumbs up (rateMessage), with the optional note offered.
  const helpful = sheet(page).getByRole('button', { name: 'Helpful' });
  await helpful.click();
  await expect(helpful).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet(page).getByRole('button', { name: 'Send note' })).toBeVisible();
  await expect(sheet(page).getByRole('alert')).toHaveCount(0);

  // History (listConversations / getConversation): the chat is there and opens again.
  await sheet(page).getByRole('button', { name: 'Past chats' }).click();
  const list = sheet(page).getByRole('list', { name: 'Past chats' });
  await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 15_000 });
  await sheet(page).getByRole('button', { name: 'Back to the chat' }).click();
  await sheet(page).getByRole('button', { name: 'New chat' }).click();
  await expect(sheet(page).getByText(`Hello from the mock model, ${tag}.`)).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Past chats' }).click();
  await list.getByRole('listitem').first().getByRole('button').first().click();
  await expect(sheet(page).getByText(`Hello from the mock model, ${tag}.`)).toBeVisible({ timeout: 15_000 });
});

test('[panel] Stop ends a slow answer and the person can ask again', async ({ page }) => {
  await signedInWithEnyo(page);
  let release: () => void = () => undefined;
  await page.route('**/api/enyo/chat', async (route) => {
    // Never answers until the test is over: the panel stays "thinking".
    await new Promise<void>((r) => { release = r; setTimeout(r, 60_000); });
    await route.abort().catch(() => undefined);
  });
  await launcher(page).click();
  await composer(page).fill('Price of an oil filter');
  await page.keyboard.press('Enter');
  const stop = sheet(page).getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(sheet(page).getByText('Stopped.')).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'Send' })).toBeVisible();
  release();
});

test('[panel] a draft card links to the normal page and never saves; unsafe links are plain text', async ({ page }) => {
  await signedInWithEnyo(page);
  await page.route('**/api/enyo/chat', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    body: sse([
      { type: 'conversation', id: 'e2e-draft' },
      { type: 'status', text: 'Preparing a reminder…' },
      { type: 'text', text: 'Here is a reminder for you to check. [Open me](javascript:alert(1)) <b>not bold</b>' },
      { type: 'draft', draft: { kind: 'reminder', title: 'Reminder: call the customer', lines: ['Tomorrow at 9:00'], href: '/reminders/new?title=Call%20the%20customer', confirmLabel: 'Review reminder' } },
      { type: 'sources', sources: [{ label: 'Approvals', href: '/approvals' }] },
      { type: 'notice', text: 'One figure could not be checked.' },
      { type: 'done', messageId: 'e2e-draft-message' },
    ]),
  }));
  let saved = false;
  page.on('request', (r) => { if (r.method() === 'POST' && /reminder/i.test(r.url())) saved = true; });
  await launcher(page).click();
  await composer(page).fill('Remind me to call the customer tomorrow');
  await page.keyboard.press('Enter');

  const draft = sheet(page).getByRole('region', { name: 'Prepared: Reminder: call the customer' });
  await expect(draft).toBeVisible();
  await expect(draft.getByRole('link', { name: 'Review reminder' })).toHaveAttribute('href', '/reminders/new?title=Call%20the%20customer');
  await expect(sheet(page).getByRole('link', { name: 'Approvals' })).toHaveAttribute('href', '/approvals');
  await expect(sheet(page).getByText('One figure could not be checked.')).toBeVisible();
  // The javascript: link is shown as words only, and HTML stays text.
  await expect(sheet(page).getByRole('link', { name: 'Open me' })).toHaveCount(0);
  await expect(sheet(page).getByText('<b>not bold</b>', { exact: false })).toBeVisible();
  expect(saved).toBe(false);
});

test('[engine] reduced motion: the avatar stands still', async ({ page }) => {
  await signedInWithEnyo(page);
  const anim = () => page.locator('[data-enyo-launcher] .av-body').evaluate((el) => getComputedStyle(el).animationName);
  expect(await anim()).toBe('enyo-av-breathe');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await anim()).toBe('none');
});

test('[engine] the daily greeting shows once a day and can be dismissed', async ({ page }) => {
  // The panel does not greet automated browsers unless they look like a person's.
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await as(page, 'receptionist');
  await page.evaluate(() => { try { localStorage.removeItem('ejo-enyo-prefs'); } catch { /* ignore */ } });
  await open(page, '/dashboard');
  const bubble = page.getByRole('status').filter({ hasText: /Good (morning|afternoon|evening), Funmi\./ });
  await expect(bubble).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dismiss greeting' }).click();
  await expect(bubble).toBeHidden();
  await open(page, '/dashboard');
  await expect(launcher(page)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4_500);
  await expect(page.getByRole('button', { name: 'Dismiss greeting' })).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('[engine] full-screen sheet at 360 px with no sideways scroll', async ({ page }) => {
    await signedInWithEnyo(page);
    await noSidewaysScroll(page);
    await launcher(page).click();
    const box = await sheet(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(359);
    await composer(page).fill('[[say:A short answer for a small screen, with a long reference JC-2026-000412-ABCDEFGHIJKLMNOPQRSTUVWXYZ.]]');
    await page.keyboard.press('Enter');
    await expect(sheet(page).getByText('A short answer for a small screen', { exact: false })).toBeVisible({ timeout: 30_000 });
    await noSidewaysScroll(page);
    const inner = await sheet(page).evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(inner.scroll).toBeLessThanOrEqual(inner.client + 1);
    // Every control in the sheet is at least 44 px tall (touch targets).
    const small = await sheet(page).locator('button:visible').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43).map((e) => e.getAttribute('aria-label') || e.textContent));
    expect(small).toEqual([]);
  });
});
