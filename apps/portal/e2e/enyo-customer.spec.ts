import { test, expect, type Page } from '@playwright/test';
import { OTHER_PORTAL_CUSTOMER, PORTAL_CUSTOMER } from './people';
import { as, latestMail, open, uniq } from './helpers';
import { WEB, customerSignedIn, portal, websiteUp } from './customer';
import { db, freshVehicle } from './db';
import { jobNumber, openJobCard } from './workflows';

/**
 * Enyo for customers and website visitors, end to end, against the stand-in
 * model (packages/enyo/testing/mock-llm.mjs, driven by [[tool:…]] markers):
 *  - a signed-in customer gets the status of their OWN Job Card; another
 *    customer asking for the same number gets "not found", nothing more;
 *  - a hand-over opens a SUP ticket that the front desk sees in the support
 *    inbox; the staff reply is emailed (Mailpit) and shows on the customer's
 *    Help & support page, where the customer can answer;
 *  - a website visitor gets company information and can leave a phone number
 *    for a call back (a WEBSITE ticket);
 *  - too many messages in a minute get a calm message, not an error page.
 */
test.beforeAll(async ({ request }) => {
  const up = await websiteUp(request);
  if (process.env.CI) expect(up, `the website (customer portal) must be running at ${WEB}`).toBe(true);
  else test.skip(!up, `the website is not running at ${WEB}`);
});

/** Opens the chat (if needed), sends one message and returns the new answer once it has finished. */
async function ask(page: Page, text: string) {
  const chat = page.getByTestId('enyo-chat');
  if (!(await chat.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^Chat with / }).click();
    await expect(chat).toBeVisible();
  }
  const answers = chat.getByTestId('enyo-answer');
  const before = await answers.count();
  await chat.getByLabel('Your message').fill(text);
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(answers).toHaveCount(before + 1);
  const answer = answers.nth(before);
  await expect(answer).not.toHaveAttribute('aria-busy', 'true', { timeout: 45_000 });
  return answer;
}

/** The SUP number in the hand-over card of an answer. */
async function handoverNumber(answer: ReturnType<Page['getByTestId']>): Promise<string> {
  const card = answer.getByTestId('enyo-handover');
  await expect(card).toBeVisible();
  const text = (await card.textContent()) ?? '';
  const m = /SUP-\d{4}-\d{6}/.exec(text);
  expect(m, `a SUP number in "${text}"`).not.toBeNull();
  return m![0];
}

test.describe('a signed-in customer', () => {
  test.describe.configure({ mode: 'serial' });
  const S = { number: '', plate: '', ticket: '', tag: uniq() };

  test('asks about their own Job Card by number and gets its status', async ({ page }) => {
    // The front desk opens a Job Card for the customer's vehicle first.
    S.plate = (await freshVehicle('ENY', { customerEmail: PORTAL_CUSTOMER.email, make: 'Honda', model: 'Accord' })).plate;
    await as(page, 'receptionist');
    await openJobCard(page, { plate: S.plate, customer: PORTAL_CUSTOMER.name, complaint: `Enyo check ${S.tag}` });
    S.number = await jobNumber(page);

    await customerSignedIn(page, PORTAL_CUSTOMER);
    const answer = await ask(page, `[[tool:job_status {"number":"${S.number}"}]]`);
    await expect(answer).toContainText('Here is what I found');
    await expect(answer).toContainText(S.number);
    await expect(answer).toContainText('Checked in');
    await expect(answer.getByTestId('enyo-error')).toHaveCount(0);
  });

  test('another customer asking for that number gets "not found" — nothing about the job', async ({ page }) => {
    test.skip(!S.number, 'needs the Job Card from the previous step');
    await customerSignedIn(page, OTHER_PORTAL_CUSTOMER);
    const answer = await ask(page, `[[tool:job_status {"number":"${S.number}"}]]`);
    await expect(answer).toContainText('No Job Card or service with that number was found');
    await expect(answer).not.toContainText(S.plate);
    await expect(answer).not.toContainText('Checked in');
    await expect(answer).not.toContainText(`Enyo check ${S.tag}`);
    // The same words as for a number that exists nowhere.
    const nowhere = await ask(page, '[[tool:job_status {"number":"JC-2099-999999"}]]');
    await expect(nowhere).toContainText('No Job Card or service with that number was found');
  });

  test('asks for a person: a SUP ticket opens, the customer gets a confirmation email', async ({ page, request }) => {
    await customerSignedIn(page, PORTAL_CUSTOMER);
    const answer = await ask(page, `[[tool:request_handover {"topic":"Enyo handover ${S.tag}"}]]`);
    S.ticket = await handoverNumber(answer);
    await expect(answer).toContainText(S.ticket);
    const mail = await latestMail(request, PORTAL_CUSTOMER.email, new RegExp(`We have your request \\(${S.ticket}\\)`));
    expect(mail.html).toContain(S.ticket);
    // Asking again in the same conversation never opens a second ticket.
    const again = await ask(page, '[[tool:request_handover {"topic":"again"}]]');
    expect(await handoverNumber(again)).toBe(S.ticket);
    await page.goto(portal('/dashboard/support'));
    await expect(page.getByTestId(`support-ticket-${S.ticket}`)).toContainText(`Enyo handover ${S.tag}`);
  });

  test('the front desk sees it in the support inbox and replies; the customer reads it and answers', async ({ page, request }) => {
    test.skip(!S.ticket, 'needs the ticket from the previous step');
    await as(page, 'receptionist');
    await open(page, '/crm/support?filter=all');
    await expect(page.getByRole('heading', { level: 1, name: 'Support centre' })).toBeVisible();
    // The inbox list, not the scrolling ticker (which also links new tickets).
    await page.getByRole('main').getByRole('link', { name: new RegExp(S.ticket) }).first().click();
    await page.waitForURL(/\/crm\/support\/[^/?]+/);
    await expect(page.getByRole('heading', { level: 1, name: S.ticket })).toBeVisible();
    await expect(page.getByText('Enyo’s summary')).toBeVisible();
    await expect(page.getByRole('link', { name: PORTAL_CUSTOMER.name })).toHaveAttribute('href', /\/crm\/customers\//);
    await page.getByText(/Show the conversation/).click();
    await expect(page.getByTestId('support-transcript')).toContainText('request_handover');

    const reply = `Your Honda will be ready on Friday ${S.tag}`;
    await page.getByLabel('Reply to the customer').fill(reply);
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Reply sent and emailed to the customer.')).toBeVisible();
    await expect(page.locator('#replies')).toContainText(reply);
    await expect(page.getByText(/after opening/)).toBeVisible();

    const mail = await latestMail(request, PORTAL_CUSTOMER.email, new RegExp(`Reply to your request ${S.ticket}`));
    expect(mail.html).toContain(`Friday ${S.tag}`);

    await customerSignedIn(page, PORTAL_CUSTOMER);
    await page.goto(portal('/dashboard/support'));
    const card = page.getByTestId(`support-ticket-${S.ticket}`);
    await expect(card).toContainText(reply);
    await expect(card).toContainText('Waiting for your reply');
    await card.getByLabel(`Reply on ${S.ticket}`).fill(`Thank you ${S.tag}`);
    await card.getByRole('button', { name: 'Send reply' }).click();
    await expect(card.getByRole('status')).toContainText('Your reply is sent.');
    await page.reload();
    await expect(page.getByTestId(`support-ticket-${S.ticket}`)).toContainText('With our team');
  });
});

test.describe('a website visitor', () => {
  test('asks about the company and gets its details', async ({ page }) => {
    await page.goto(`${WEB}/`);
    const answer = await ask(page, '[[tool:organisation_info]]');
    await expect(answer).toContainText('Here is what I found');
    await expect(answer).toContainText('Kewalram');
    await expect(answer.getByTestId('enyo-error')).toHaveCount(0);
  });

  test('greetings, "who is" one of our people, how to reach us and the offers are answered from the records at once', async ({ page }) => {
    // One of the people the organisation publishes (Organisation → People we publish).
    const org = await db().organisation.findFirstOrThrow({ where: { slug: process.env.WEBSITE_ORGANISATION_SLUG || 'kewalram-nigeria' }, select: { id: true } });
    const tag = uniq();
    const name = `Sudeep Mittal${tag}`;
    await db().publicProfile.create({ data: { organisationId: org.id, name, title: 'Head of Automobiles, Nigeria', area: 'Automobiles', bio: 'Leads the automobile business in Nigeria.', isPublic: true, sortOrder: 1 } });
    await page.goto(`${WEB}/`);
    const hi = await ask(page, 'Hey Enyo');
    await expect(hi).toContainText(/Good (morning|afternoon|evening)! I'm/);
    await expect(hi).not.toContainText('You said');
    const who = await ask(page, `Hi who's ${name}`);
    await expect(who).toContainText(`${name} — Head of Automobiles, Nigeria`);
    await expect(who).not.toContainText('You said');
    const offers = await ask(page, 'Any financing offers?');
    await expect(offers).toContainText('Keystone Bank');
    const reach = await ask(page, 'How can I reach you?');
    await expect(reach).toContainText('Contact us');
    for (const a of [hi, who, offers, reach]) await expect(a.getByTestId('enyo-error')).toHaveCount(0);
    await db().publicProfile.deleteMany({ where: { organisationId: org.id, name } });
  });

  test('when the model is out of budget, the visitor still gets an answer — never "try again in a minute"', async ({ page }) => {
    await page.goto(`${WEB}/`);
    const busy = await ask(page, 'Which SUV is best for a family of six? [[busy]]');
    await expect(busy.getByTestId('enyo-error')).toHaveCount(0);
    await expect(busy).toContainText('the team can help straight away');
    await expect(busy).toContainText('Contact us');
    await expect(busy).not.toContainText(/handling a lot of questions|try again in a minute/);
    // The next question is answered normally (the failed turn does not confuse it).
    const next = await ask(page, '[[say:Happy to help with SUVs.]]');
    await expect(next).toContainText('Happy to help with SUVs.');
  });

  test('leaves a phone number for a call back: a WEBSITE ticket the front desk can open', async ({ page }) => {
    const tag = uniq();
    await page.goto(`${WEB}/contact`);
    const answer = await ask(page, `[[tool:request_handover {"name":"Visitor ${tag}","phone":"0803 555 0101","topic":"Book a service ${tag}","consent":true}]]`);
    const ticket = await handoverNumber(answer);
    await expect(answer.getByTestId('enyo-handover')).toContainText('call you');

    await as(page, 'receptionist');
    await open(page, `/crm/support?filter=all&q=${encodeURIComponent(ticket)}`);
    await page.getByRole('main').getByRole('link', { name: new RegExp(ticket) }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: ticket })).toBeVisible();
    await expect(page.getByText('Website enquiry')).toBeVisible();
    await expect(page.getByText(`Visitor ${tag}`).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '0803 555 0101' }).first()).toBeVisible();
    await expect(page.getByText(/No email address on this ticket/)).toBeVisible();
  });

  test('without agreeing, no ticket is opened', async ({ page }) => {
    await page.goto(`${WEB}/`);
    const answer = await ask(page, '[[tool:request_handover {"name":"Visitor","phone":"08035550102","consent":false}]]');
    await expect(answer).toContainText('has not agreed');
    await expect(answer.getByTestId('enyo-handover')).toHaveCount(0);
  });

  test('sending too many messages in a minute gets a calm message', async ({ page }) => {
    await page.goto(`${WEB}/about`);
    let last = await ask(page, '[[say:One]]');
    for (let i = 0; i < 8; i++) {
      last = await ask(page, `[[say:Again ${i}]]`);
      if (await last.getByTestId('enyo-error').count()) break;
    }
    await expect(last.getByTestId('enyo-error')).toContainText('You are sending messages quickly. Please wait a minute, then try again.');
    await expect(last).not.toContainText(/429|error/i);
  });

  test.describe('on a 360 px phone', () => {
    test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
    test('the chat fills the screen, closes with its button, and nothing scrolls sideways', async ({ page }) => {
      await page.goto(`${WEB}/`);
      const button = page.getByRole('button', { name: /^Chat with / });
      await button.click();
      const chat = page.getByTestId('enyo-chat');
      await expect(chat).toBeVisible();
      // Full width of the 360 px screen once the opening animation settles (a pixel either way is rounding, not layout).
      await expect.poll(async () => Math.abs(((await chat.boundingBox())?.width ?? 0) - 360), { timeout: 5_000 }).toBeLessThanOrEqual(1.5);
      const scroll = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
      expect(scroll).toBeLessThanOrEqual(1);
      await chat.getByRole('button', { name: 'Close chat' }).click();
      await expect(chat).toHaveCount(0);
      await expect(button).toBeFocused();
    });
  });
});
