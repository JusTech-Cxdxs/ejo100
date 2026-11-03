import { test, expect, type Page } from '@playwright/test';
import { db } from './db';
import { expectHealthy, gotoSettled, signIn, signOut, visitHealthy } from './helpers';
import { DEMO_E2E_PASSWORD } from './people';
import { customerSignedIn, websiteUp } from './customer';
import { DEMO_CUSTOMERS, demoPerson } from '../lib/demo/people';

/**
 * D2 — the workshop demo (lib/workshop/demo). The CI seed loaded it
 * (`npm run demo:ensure` after the demo people), so every page the demo
 * people open is full: here, each of them signs in and walks their own
 * pages — nothing broken, the figures the brief asks for on screen — and
 * the customer portal shows a customer's own vehicle and service. The plan's
 * rules are proved in tests/workshop-demo.test.ts; this proves the portal
 * renders what the plan made.
 */
test.describe.configure({ mode: 'serial' });

const P = DEMO_E2E_PASSWORD;
const as = async (page: Page, role: string, branch?: 'HQ' | 'ISOLO' | 'AFPRINT') => { await signIn(page, demoPerson(role, branch).email, P); };
const walk = async (page: Page, urls: string[]) => { for (const u of urls) await visitHealthy(page, u); };

async function demoOrgId(): Promise<string> {
  return (await db().organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' }, select: { id: true } })).id;
}

test('the demo is in place: records registered, job cards at every status, the plant’s sold vehicles point at their customers', async () => {
  const org = await demoOrgId();
  expect(await db().demoRecord.count({ where: { organisationId: org } })).toBeGreaterThan(5_000);
  const statuses = await db().jobCard.groupBy({ by: ['status'], where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' } }, _count: true });
  for (const s of ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT', 'CANCELLED']) expect(statuses.map((x) => x.status), s).toContain(s);
  // The plant-demo spec may reload the plant demo at the same time (two workers): then the sold ones are back in the yard for a moment.
  const sold = await db().plantVehicle.findMany({ where: { organisationId: org, stage: 'SOLD', externalSource: 'EJO-DEMO' }, select: { customerVehicleId: true, vinKey: true } });
  if (sold.length) expect(sold).toHaveLength(6);
  for (const v of sold) { const cv = await db().customerVehicle.findUniqueOrThrow({ where: { id: v.customerVehicleId! }, select: { chassisNumber: true, customer: { select: { externalSource: true } } } }); expect(cv.chassisNumber?.toUpperCase()).toBe(v.vinKey); expect(cv.customer.externalSource).toBe('EJO-DEMO'); }
  // The four sign-ins' customers hold their stories.
  const adaora = await db().customer.findUniqueOrThrow({ where: { email: DEMO_CUSTOMERS[0]!.email }, select: { vehicles: { select: { id: true } }, vehicleServices: { select: { status: true } } } });
  expect(adaora.vehicles).toHaveLength(1);
  expect(adaora.vehicleServices.map((s) => s.status)).toContain('IN_SERVICE');
  const warrantyCustomer = await db().customer.findUniqueOrThrow({ where: { email: DEMO_CUSTOMERS[2]!.email }, select: { id: true } });
  expect(await db().warrantyClaim.count({ where: { customerId: warrantyCustomer.id, status: 'SUBMITTED' } })).toBe(1);
});

test('the Manager: the dashboard, every workshop page, a job card with its estimate, parts slip, payments and history, the service tracker, refunds, custody', async ({ page }) => {
  await as(page, 'workshop-manager');
  await expect(page).toHaveURL(/\/dashboard/);
  await expectHealthy(page);
  await walk(page, ['/workshop', '/workshop/job-cards', '/workshop/vehicle-service', '/workshop/customers', '/workshop/vehicles', '/workshop/custody', '/workshop/refunds', '/workshop/parts-requests', '/workshop/external-procurement', '/workshop/service-tracker', '/approvals', '/analytics', '/headquarters', '/crm']);
  // A checked-out job card with everything on it.
  const org = await demoOrgId();
  const jc = await db().jobCard.findFirstOrThrow({ where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' }, status: 'CHECKED_OUT', payments: { some: {} }, partRequestSlips: { some: { status: 'RELEASED' } } }, orderBy: { createdAt: 'desc' }, select: { id: true, jobNumber: true } });
  await visitHealthy(page, `/workshop/job-cards/${jc.id}`);
  await expect(page.getByText(jc.jobNumber).first()).toBeVisible();
  await expect(page.getByText(/Checked out/i).first()).toBeVisible();
  // One waiting for parts, one cancelled with its refund.
  const waiting = await db().jobCard.findFirstOrThrow({ where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' }, status: 'AWAITING_PARTS' }, select: { id: true } });
  await visitHealthy(page, `/workshop/job-cards/${waiting.id}`);
  const refunded = await db().refund.findFirstOrThrow({ where: { jobCard: { customer: { organisationId: org, externalSource: 'EJO-DEMO' } } }, select: { jobCardId: true, referenceNumber: true } });
  await visitHealthy(page, `/workshop/job-cards/${refunded.jobCardId}`);
  await visitHealthy(page, '/workshop/refunds');
  await expect(page.getByText(refunded.referenceNumber).first()).toBeVisible();
  // A service in progress and the escalated one.
  const sv = await db().vehicleService.findFirstOrThrow({ where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' }, status: 'ESCALATED' }, select: { id: true } });
  await visitHealthy(page, `/workshop/vehicle-service/${sv.id}`);
  await signOut(page);
});

test('the technician sees only his own jobs; the front desk its pages; the Store its stock alerts, pricing alerts, receipts and suppliers', async ({ page }) => {
  await as(page, 'technician', 'ISOLO');
  await walk(page, ['/workshop/job-cards', '/workshop/vehicle-service']);
  await gotoSettled(page, '/plant');
  await expect(page).toHaveURL(/\/access-denied/);
  await signOut(page);
  await as(page, 'receptionist');
  await walk(page, ['/workshop/customers', '/workshop/vehicles', '/workshop/vehicle-service/book', '/security/my-visitors', '/schedule']);
  await signOut(page);
  await as(page, 'store-manager');
  await walk(page, ['/inventory', '/inventory/parts', '/inventory/reorder', '/inventory/pricing', '/inventory/goods-receipts', '/inventory/suppliers', '/inventory/estimate-matching', '/inventory/analytics', '/inventory/part-types']);
  // The parts list carries the stock level of each (the dot), with the four parts the plan let run down.
  await gotoSettled(page, '/inventory/parts?q=Brake+pad');
  await expect(page.getByText(/Brake pad set, front/).first()).toBeVisible();
  const org = await demoOrgId();
  expect(await db().pricingAlert.count({ where: { status: 'OPEN', part: { externalSource: 'EJO-DEMO', branch: { businessUnit: { organisationId: org } } } } })).toBe(2);
  const grn = await db().goodsReceipt.findFirstOrThrow({ where: { isOpeningBalance: false, idempotencyKey: { startsWith: `demo:${org}` } }, select: { id: true, referenceNumber: true } });
  await visitHealthy(page, `/inventory/goods-receipts/${grn.id}`);
  await expect(page.getByText(grn.referenceNumber).first()).toBeVisible();
  const battery = await db().part.findFirstOrThrow({ where: { externalSource: 'EJO-DEMO', externalId: 'battery-75' }, select: { id: true } });
  await visitHealthy(page, `/inventory/parts/${battery.id}`);
  await signOut(page);
});

test('warranty: the HOD sees nine claims at their stages, a warranty, providers and policies; the Warranty Officer cannot approve', async ({ page }) => {
  await as(page, 'warranty-hod');
  await walk(page, ['/warranty', '/warranty/claims', '/warranty/policies', '/warranty/providers', '/warranty/analytics']);
  await gotoSettled(page, '/warranty/claims');
  for (const word of [/Draft/i, /Submitted/i, /Settled/i, /Rejected/i]) await expect(page.getByText(word).first()).toBeVisible();
  const org = await demoOrgId();
  const claim = await db().warrantyClaim.findFirstOrThrow({ where: { status: 'PENDING_HOD', customer: { organisationId: org } }, select: { id: true, claimNumber: true } });
  await visitHealthy(page, `/warranty/claims/${claim.id}`);
  await expect(page.getByText(claim.claimNumber).first()).toBeVisible();
  const w = await db().warranty.findFirstOrThrow({ where: { kind: 'ASSET', status: 'PENDING_VERIFICATION', customer: { organisationId: org } }, select: { id: true } });
  await visitHealthy(page, `/warranty/${w.id}`);
  await signOut(page);
});

test('security: the CSO’s overdue list has the visitor past their time and the exit pass out past its return; the gate’s pages; the Executive and the Administrator see everything read-only; the plant’s people', async ({ page }) => {
  await as(page, 'chief-security-officer');
  await walk(page, ['/security', '/security/overdue', '/security/visitors', '/security/exit-passes', '/security/road-tests', '/security/incidents', '/security/deliveries', '/security/contractors', '/security/on-premises', '/security/vehicles', '/security/vehicles/exits', '/security/people-out']);
  await gotoSettled(page, '/security/overdue');
  await expect(page.getByText(/Leadway assessor/).first()).toBeVisible();
  await expect(page.getByText(/Collect parts from Ladipo market/).first()).toBeVisible();
  await signOut(page);
  await as(page, 'security-officer', 'ISOLO');
  await walk(page, ['/security/register', '/security/vehicles-inside']);
  await signOut(page);
  await as(page, 'executive');
  await walk(page, ['/dashboard', '/headquarters', '/analytics', '/workshop', '/inventory', '/warranty', '/plant', '/plant/line', '/security', '/crm/support', '/notifications/broadcasts']);
  await signOut(page);
  await as(page, 'administrator', 'HQ');
  await walk(page, ['/users', '/structure', '/audit-logs', '/data-exchange', '/data-exchange/exports', '/data-exchange/timeline', '/recycle-bin', '/organisation/people']);
  await signOut(page);
  await as(page, 'customer-care', 'ISOLO');
  await walk(page, ['/crm/support', '/crm/support/analytics']);
  await gotoSettled(page, '/crm/support');
  await expect(page.getByText(/scratch on the bonnet/).first()).toBeVisible();
  await signOut(page);
  await as(page, 'plant-manager');
  await walk(page, ['/plant', '/plant/vehicles', '/plant/line', '/plant/kits', '/plant/qa']);
  await signOut(page);
});

test('an Afprint-built vehicle’s passport reads from the kit to its first service at Isolo; search finds a demo job card by number', async ({ page }) => {
  await as(page, 'executive');
  const org = await demoOrgId();
  const sold = await db().customerVehicle.findFirstOrThrow({ where: { externalSource: 'EJO-DEMO', model: { contains: 'built at Afprint' }, customer: { organisationId: org } }, select: { chassisNumber: true } });
  await visitHealthy(page, `/vehicles/${sold.chassisNumber}`);
  await expect(page.getByText(sold.chassisNumber!).first()).toBeVisible();
  await expect(page.getByText(/service/i).first()).toBeVisible();
  const jc = await db().jobCard.findFirstOrThrow({ where: { customer: { organisationId: org, externalSource: 'EJO-DEMO' }, status: 'READY_FOR_COLLECTION' }, select: { jobNumber: true } });
  await gotoSettled(page, `/dashboard?q=${encodeURIComponent(jc.jobNumber)}`);
  await expectHealthy(page);
  await signOut(page);
});

test('the customer portal: Adaora sees her S07 and the service in progress; the fleet company its trucks', async ({ page, request }) => {
  test.skip(!(await websiteUp(request)), 'the customer portal (apps/website) is not running');
  const adaora = DEMO_CUSTOMERS[0]!;
  await customerSignedIn(page, { email: adaora.email, name: adaora.name, password: P });
  await expect(page.getByText(/S07/).first()).toBeVisible();
  await page.context().clearCookies();
  const fleet = DEMO_CUSTOMERS[1]!;
  await customerSignedIn(page, { email: fleet.email, name: fleet.name, password: P });
  await expect(page.getByText(/NQR|NPR|FRR/).first()).toBeVisible();
});
