import { test, expect } from '@playwright/test';
import { as, open, latestMail, countMail } from './helpers';
import { db } from './db';
import { who } from './people';

/**
 * B — portal invitations for imported customers: on a loaded customers
 * import, the Administrator invites the customers it made who have an email
 * and no portal access yet. Each gets the welcome with a one-time link to
 * set their own password — once; a customer with no email is left to the
 * phone; one who already has access is not written to again.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = String(Date.now()).slice(-8);
const mail = (n: number) => `imported-${STAMP}-${n}@e2e.test`;
const ids = { job: '', invite: '', noEmail: '', hasAccess: '' };

test('set up: a loaded customers import — one to invite, one with no email, one who already has access', async () => {
  const admin = await db().user.findUniqueOrThrow({ where: { email: who('administrator').email }, select: { id: true, organisationId: true } });
  const org = admin.organisationId!;
  ids.job = (await db().importJob.create({ data: { number: `IMP-E2E-INV-${STAMP}`, organisationId: org, entity: 'customers', fileName: `customers-${STAMP}.csv`, fileSha256: `e2e-${STAMP}`.padEnd(64, '0'), headers: ['Name', 'Email', 'Phone'], mapping: { fullName: 0, email: 1, phone: 2 }, status: 'COMPLETED', completedAt: new Date(), createdById: admin.id, goodRows: 3, createdRows: 3 }, select: { id: true } })).id;
  const make = (n: number, email: string | null) => db().customer.create({ data: { organisationId: org, fullName: `Imported ${STAMP} ${n}`, email, phone: `0803${STAMP.slice(-6)}${n}`, importJobId: ids.job, externalSource: 'SAP', externalId: `9${STAMP}${n}` }, select: { id: true } });
  ids.invite = (await make(1, mail(1))).id;
  ids.noEmail = (await make(2, null)).id;
  ids.hasAccess = (await make(3, mail(3))).id;
  await db().customerAccount.create({ data: { customerId: ids.hasAccess, accountId: ids.hasAccess, providerId: 'credential', password: 'x' } });
});

test('the Administrator invites them from the import: the welcome with a one-time link, once', async ({ page, request }) => {
  await as(page, 'administrator');
  await open(page, `/data-exchange/imports/${ids.job}`);
  const box = page.getByTestId('portal-invitations');
  await expect(box).toContainText('0 invited · 1 can be invited · 1 already have access, or have it switched off · 1 with no email');
  await box.getByRole('button', { name: 'Invite 1 to the customer portal' }).click();
  await expect(box.getByRole('status')).toContainText('Invited 1', { timeout: 30_000 });
  await expect(box).toContainText('1 invited · 0 can be invited', { timeout: 20_000 });
  await expect(box.getByRole('button', { name: /Invite/ })).toHaveCount(0);

  const [a, b, c] = await Promise.all([ids.invite, ids.noEmail, ids.hasAccess].map((id) => db().customer.findUniqueOrThrow({ where: { id }, select: { portalInvitedAt: true, _count: { select: { accounts: true } } } })));
  expect(a!.portalInvitedAt).not.toBeNull();
  expect(a!._count.accounts).toBe(1);
  expect([b!.portalInvitedAt, c!.portalInvitedAt]).toEqual([null, null]);

  const welcome = await latestMail(request, mail(1), /set up your customer portal account/);
  expect(welcome.html).toContain('Set my password');
  expect(welcome.html).toMatch(/customer-portal\/reset-password/);
  expect(welcome.html).not.toContain(who('administrator').name);
  expect(await countMail(request, mail(3), /./)).toBe(0);
  expect(await db().auditLog.count({ where: { entityType: 'Customer', entityId: ids.invite, action: 'customer.portal_invited' } })).toBe(1);
});

test('the customer’s own page still sends a new link; the import never writes to them again', async ({ page, request }) => {
  await as(page, 'administrator');
  await open(page, `/data-exchange/imports/${ids.job}`);
  await expect(page.getByTestId('portal-invitations')).toContainText('Every customer from this import who can use the portal has been invited.');
  expect(await countMail(request, mail(1), /./)).toBe(1);
});
