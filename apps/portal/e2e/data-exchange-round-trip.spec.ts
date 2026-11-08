import { test, expect, type Page } from '@playwright/test';
import { as, open } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * P10 — the round trip: customers exported from EJO, edited in Excel and
 * uploaded again with "Update customers exported from EJO". Each row is found
 * by its EJO record only; the check previews every change as "from → to" (a
 * phone written another way is no change, an empty cell leaves a field as it
 * is, a record of another organisation or none at all is refused); the
 * Workshop Manager approves; the load changes exactly that, with each change
 * in the customer's history; a field changed in EJO after the check is left
 * as it is; and the undo puts back what each field was.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-8);
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
const ids: { a: string; b: string } = { a: '', b: '' };
let url = '';

async function upload(page: Page, body: string) {
  await as(page, 'it-administrator');
  await open(page, '/data-exchange/new?entity=customers');
  await expect(page.locator('#import-file')).toHaveCount(1);
  await page.locator('#import-file').setInputFiles({ name: `customers-edited-${STAMP}.csv`, mimeType: 'text/csv', buffer: Buffer.from(body) });
  await page.waitForURL(/\/data-exchange\/imports\/[^/?]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await expect(page.locator('#map-ejoRecord')).not.toHaveValue('');
}

test('the check: found by the EJO record, every change previewed, the same value written another way is no change, refusals in plain words', async ({ page }) => {
  const { organisationId } = await db().user.findUniqueOrThrow({ where: { email: who('it-administrator').email }, select: { organisationId: true } });
  const make = (n: number) => db().customer.create({ data: { organisationId: organisationId!, fullName: `Round Trip ${STAMP} ${n}`, phone: `0803${STAMP.slice(0, 6)}${n}`, address: '3 Old Road, Ikeja', email: `rt${n}.${STAMP}@e2e.test` }, select: { id: true } });
  ids.a = (await make(1)).id;
  ids.b = (await make(2)).id;
  const a = await db().customer.findUniqueOrThrow({ where: { id: ids.a } });
  const b = await db().customer.findUniqueOrThrow({ where: { id: ids.b } });
  await upload(page, csv([
    ['Customer number (SAP or old system)', 'Name', 'Phone', 'Second phone', 'Email', 'Address', 'Customer since', 'EJO record', 'Link'],
    // a: a new address and a SAP number; the phone written the international way (no change); no second phone (left as it is).
    ['', a.fullName, `'+234 ${a.phone!.slice(1)}`, '', a.email!, '12 New Road, Ikeja', '14.03.2019', ids.a, ''],
    // b: a new name and phone.
    ['', `Round Trip ${STAMP} Two Ltd`, '0809 000 1111', '', b.email!, b.address!, '', ids.b, ''],
    ['', 'Nobody', '0809 000 2222', '', '', '', '', 'cxxxxxxxxxxxxxxxxxxxxxxxx', ''],
    ['', 'No record', '0809 000 3333', '', '', '', '', '', ''],
  ]));
  await page.getByLabel(/Update customers exported from EJO/).check();
  await expect(page.getByTestId('round-trip-help')).toContainText('Rows are found only by the “EJO record” column');
  await page.getByRole('button', { name: 'Save and check the file' }).click();
  await expect(page.getByRole('heading', { name: 'What the check found' })).toBeVisible({ timeout: 60_000 });
  url = page.url();
  await expect(page.getByText('This EJO record is not one of your organisation’s customers.')).toBeVisible();
  await expect(page.getByText(/No EJO record: “Update records exported from EJO” changes only records exported from EJO/)).toBeVisible();
  const changes = page.getByTestId('round-trip-changes');
  await expect(changes).toContainText('To change: 2 customers · 4 fields');
  await expect(changes).toContainText('Address: 3 Old Road, Ikeja → 12 New Road, Ikeja');
  await expect(changes).toContainText('Customer since: (empty) → 2019-03-14');
  await expect(changes).toContainText(`Name: Round Trip ${STAMP} 2 → Round Trip ${STAMP} Two Ltd`);
  await expect(changes).not.toContainText('Phone: 0803');
  // Nothing has changed yet.
  expect((await db().customer.findUniqueOrThrow({ where: { id: ids.a } })).address).toBe('3 Old Road, Ikeja');
  await page.getByRole('button', { name: /Send for approval/ }).click();
});

test('approved and loaded: exactly the previewed changes, each in the customer’s history; one changed in EJO after the check is left as it is', async ({ page }) => {
  // Someone changes b's phone at the desk after the check.
  await db().customer.update({ where: { id: ids.b }, data: { phone: '0807 555 0000' } });
  await as(page, 'workshop-manager');
  await open(page, url);
  await expect(page.getByText(/Approving changes 2 customers \(4 fields\) exactly as previewed/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Start loading' }).click();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible({ timeout: 90_000 });
  const [a, b] = await Promise.all([ids.a, ids.b].map((id) => db().customer.findUniqueOrThrow({ where: { id } })));
  expect([a!.address, a!.customerSince?.toISOString().slice(0, 10)]).toEqual(['12 New Road, Ikeja', '2019-03-14']);
  expect([b!.fullName, b!.phone]).toEqual([`Round Trip ${STAMP} Two Ltd`, '0807 555 0000']);
  const audit = await db().auditLog.findFirstOrThrow({ where: { entityType: 'Customer', entityId: ids.a, action: 'customer.updated' }, orderBy: { createdAt: 'desc' } });
  expect(audit.metadata).toMatchObject({ via: 'import', changes: { address: { from: '3 Old Road, Ikeja', to: '12 New Road, Ikeja' } } });
  expect(await db().customer.count({ where: { fullName: { in: ['Nobody', 'No record'] } } })).toBe(0);
});

test('undo: each field still as the file left it goes back; one changed since is kept', async ({ page }) => {
  await db().customer.update({ where: { id: ids.a }, data: { customerSince: new Date('2018-01-01T00:00:00.000Z') } });
  await as(page, 'workshop-manager');
  await open(page, url);
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Undo this import' }).click();
  await expect(page.getByRole('heading', { name: 'Undone' })).toBeVisible({ timeout: 60_000 });
  const [a, b] = await Promise.all([ids.a, ids.b].map((id) => db().customer.findUniqueOrThrow({ where: { id } })));
  expect([a!.address, a!.customerSince?.toISOString().slice(0, 10)]).toEqual(['3 Old Road, Ikeja', '2018-01-01']);
  expect(b!.fullName).toBe(`Round Trip ${STAMP} 2`);
});
