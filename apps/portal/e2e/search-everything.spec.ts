import { test, expect, type Page } from '@playwright/test';
import { Prisma } from '@prisma/client';
import { CUSTOMER, E2E_PASSWORD, OTHER_BRANCH_TECH, OTHER_ORG_ADMIN, SEED_WARRANTY } from './people';
import { as, expectHealthy, signIn } from './helpers';
import { db } from './db';

/**
 * The header search finds EVERY kind of numbered record — by its prefix
 * alone ("VX", "RT", "PRS": no digits), by its full number and by its running
 * number — and each result opens that exact record. People only find the
 * kinds of record they may open.
 *
 * The records are fixtures written straight to the test database (the thing
 * under test is the search, not how each record is made). They use the year
 * 2020 and running number 731042, so they never touch this year's numbering,
 * and are dated 2020 so they sit at the bottom of every list. Re-runnable:
 * each is upserted by its number.
 */
test.describe.configure({ mode: 'serial' });

const SEQ = '731042';
const num = (prefix: string) => `${prefix}-2020-${SEQ}`;
const OLD = new Date('2020-06-01T09:00:00Z');
/** prefix → the record's page, filled in by the fixtures. */
const PAGE: Record<string, string> = {};
const GROUP: Record<string, string> = {
  JC: 'Job Cards', SV: 'Vehicle Services', PRS: 'Parts requests', EPR: 'External procurement', GRN: 'Goods receipts', RF: 'Refunds', WR: 'Warranties',
  WC: 'Warranty claims', VIS: 'Visitors', EP: 'Exit passes', VX: 'Vehicle exits', RT: 'Road tests', INC: 'Incidents', DLV: 'Deliveries', CTR: 'Contractors',
  APT: 'Appointments', BC: 'Broadcasts',
};

async function fixtures() {
  const prisma = db();
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' } });
  const u = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const [admin, front, sec, tech] = await Promise.all([u('admin@e2e.test'), u('frontdesk@e2e.test'), u('security@e2e.test'), u('tech@e2e.test')]);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: CUSTOMER.email } });
  const vehicle = await prisma.customerVehicle.upsert({
    where: { plateNumber: 'SRCH-731042' }, update: {},
    create: { customerId: customer.id, make: 'Honda', model: 'Accord', year: 2019, vehicleType: 'PASSENGER', plateNumber: 'SRCH-731042', mileage: 20000, createdById: front.id },
  });
  const base = { branchId: branch.id, createdAt: OLD };
  const jc = await prisma.jobCard.upsert({ where: { jobNumber: num('JC') }, update: {}, create: { ...base, jobNumber: num('JC'), customerId: customer.id, vehicleId: vehicle.id, createdById: front.id, complaint: 'Search fixture' } });
  PAGE.JC = `/workshop/job-cards/${jc.id}`;
  const sv = await prisma.vehicleService.upsert({ where: { serviceNumber: num('SV') }, update: {}, create: { ...base, serviceNumber: num('SV'), customerId: customer.id, vehicleId: vehicle.id, createdById: front.id } });
  PAGE.SV = `/workshop/vehicle-service/${sv.id}`;
  const prs = await prisma.partRequestSlip.upsert({ where: { referenceNumber: num('PRS') }, update: {}, create: { ...base, referenceNumber: num('PRS'), jobCardId: jc.id, requestedById: tech.id } });
  PAGE.PRS = `/workshop/parts-requests/${prs.id}`;
  const epr = await prisma.externalProcurementRequest.upsert({ where: { referenceNumber: num('EPR') }, update: {}, create: { ...base, referenceNumber: num('EPR'), jobCardId: jc.id, requestedById: tech.id, description: 'Search fixture purchase', estimatedAmount: new Prisma.Decimal(1000) } });
  PAGE.EPR = `/workshop/external-procurement/${epr.id}`;
  const grn = await prisma.goodsReceipt.upsert({ where: { referenceNumber: num('GRN') }, update: {}, create: { ...base, referenceNumber: num('GRN'), supplierName: 'Search Fixture Supplies', receivedById: admin.id, receivedAt: OLD } });
  PAGE.GRN = `/inventory/goods-receipts/${grn.id}`;
  await prisma.refund.upsert({ where: { referenceNumber: num('RF') }, update: {}, create: { referenceNumber: num('RF'), jobCardId: jc.id, amount: new Prisma.Decimal(500), method: 'CASH', paidToName: 'Ada Customer', reason: 'Search fixture', recordedById: admin.id, recordedAt: OLD, createdAt: OLD } });
  PAGE.RF = PAGE.JC;
  const policy = await prisma.warrantyPolicy.findUniqueOrThrow({ where: { code: SEED_WARRANTY.vehiclePolicyCode } });
  const wr = await prisma.warranty.upsert({
    where: { warrantyNumber: num('WR') }, update: {},
    create: { warrantyNumber: num('WR'), kind: policy.kind, policyId: policy.id, providerId: policy.providerId, customerId: customer.id, vehicleId: vehicle.id, subjectDescription: 'Honda Accord SRCH-731042', startsAt: OLD, endsAt: new Date('2021-06-01T09:00:00Z'), coverageSnapshot: 'Search fixture cover', origin: 'MANUAL', createdAt: OLD },
  });
  PAGE.WR = `/warranty/${wr.id}`;
  const wc = await prisma.warrantyClaim.upsert({
    where: { claimNumber: num('WC') }, update: {},
    create: { claimNumber: num('WC'), warrantyId: wr.id, providerId: policy.providerId, customerId: customer.id, vehicleId: vehicle.id, complaint: 'Search fixture', cause: 'Fixture', correction: 'Fixture', causalPart: 'Fixture part', failureDate: OLD, createdById: admin.id, createdAt: OLD },
  });
  PAGE.WC = `/warranty/claims/${wc.id}`;
  const vis = await prisma.visit.upsert({ where: { visitNumber: num('VIS') }, update: {}, create: { ...base, visitNumber: num('VIS'), passNumber: num('VP'), status: 'CANCELLED', visitorName: 'Search Fixture Visitor', purpose: 'Search fixture', hostUserId: admin.id, registeredById: sec.id } });
  PAGE.VIS = `/security/visitors/${vis.id}`;
  PAGE.VP = PAGE.VIS;
  const ep = await prisma.exitPass.upsert({ where: { passNumber: num('EP') }, update: {}, create: { ...base, passNumber: num('EP'), requestedById: tech.id, reason: 'Search fixture', returning: false } });
  PAGE.EP = `/security/exit-passes/${ep.id}`;
  const vx = await prisma.vehicleGateExit.upsert({ where: { exitNumber: num('VX') }, update: {}, create: { ...base, exitNumber: num('VX'), vehicleId: vehicle.id, jobCardId: jc.id, exitedById: sec.id, exitedAt: OLD } });
  PAGE.VX = `/security/vehicles/exits/${vx.id}`;
  const rt = await prisma.roadTestPermit.upsert({ where: { permitNumber: num('RT') }, update: {}, create: { ...base, permitNumber: num('RT'), vehicleId: vehicle.id, jobCardId: jc.id, requestedById: tech.id, driverId: tech.id, purpose: 'Search fixture', expectedDurationMinutes: 30 } });
  PAGE.RT = `/security/road-tests/${rt.id}`;
  const inc = await prisma.securityIncident.upsert({ where: { incidentNumber: num('INC') }, update: {}, create: { ...base, incidentNumber: num('INC'), type: 'Search fixture', severity: 'LOW', occurredAt: OLD, location: 'Gate', description: 'Search fixture', reportedById: sec.id } });
  PAGE.INC = `/security/incidents/${inc.id}`;
  const dlv = await prisma.gateDelivery.upsert({ where: { deliveryNumber: num('DLV') }, update: {}, create: { ...base, deliveryNumber: num('DLV'), status: 'CANCELLED', supplierName: 'Search Fixture Supplies', items: 'Boxes', registeredById: sec.id } });
  PAGE.DLV = `/security/deliveries/${dlv.id}`;
  const ctr = await prisma.contractorPass.upsert({
    where: { passNumber: num('CTR') }, update: {},
    create: { ...base, passNumber: num('CTR'), company: 'Search Fixture Contractors', work: 'Painting', workArea: 'Yard', leadName: 'Fixture Lead', teamSize: 2, validFrom: OLD, validUntil: new Date('2020-06-02T17:00:00Z'), hostUserId: admin.id, requestedById: admin.id },
  });
  PAGE.CTR = `/security/contractors/${ctr.id}`;
  const apt = await prisma.appointment.upsert({ where: { appointmentNumber: num('APT') }, update: {}, create: { ...base, appointmentNumber: num('APT'), title: 'Search fixture meeting', ownerId: admin.id, createdById: admin.id, startsAt: OLD, endsAt: new Date('2020-06-01T10:00:00Z') } });
  PAGE.APT = `/schedule/${apt.id}`;
  // Ended long ago and stopped: never shown on anyone's ticker.
  const bc = await prisma.broadcast.upsert({ where: { broadcastNumber: num('BC') }, update: {}, create: { broadcastNumber: num('BC'), organisationId: org.id, category: 'NEWS', title: 'Search fixture notice', message: 'Search fixture', startsAt: OLD, endsAt: new Date('2020-06-02T09:00:00Z'), isActive: false, stoppedAt: OLD, createdById: admin.id, createdAt: OLD } });
  PAGE.BC = `/notifications/broadcasts/${bc.id}`;
}

/** Type into the header search (desktop) and return its results popup once the answer is in. */
async function search(page: Page, q: string) {
  const box = page.getByRole('combobox', { name: 'Search everything' });
  await box.fill(q);
  const panel = box.locator('xpath=ancestor::div[2]');
  const answered = panel.getByRole('listbox', { name: 'Search results' }).or(panel.getByText(/^Nothing found for/)).or(panel.getByText(/Search isn’t available/));
  await expect(answered.first()).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Searching' })).toHaveCount(0);
  await expect(panel, 'the search must answer, not fail').not.toContainText('Search isn’t available');
  return panel;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const option = (panel: ReturnType<Page['locator']>, n: string) => panel.getByRole('option', { name: new RegExp(esc(n)) }).first();

test.beforeAll(async () => { await fixtures(); });

test('every reference type is found by full number, prefix + running number and running number, and opens its record', async ({ page }) => {
  // 17 kinds of record, three searches and one page each.
  test.setTimeout(300_000);
  await as(page, 'administrator');
  await page.goto('/dashboard');
  // The running number alone finds every type's record at once.
  const all = await search(page, SEQ);
  for (const prefix of Object.keys(GROUP)) await expect(option(all, num(prefix)), `${SEQ} finds ${num(prefix)}`).toBeVisible();
  for (const prefix of Object.keys(GROUP)) {
    await test.step(prefix, async () => {
      const n = num(prefix);
      // Typed in lower case without dashes; and the prefix with the running number: "vx 731042".
      for (const q of [n.toLowerCase().replace(/-/g, ''), `${prefix.toLowerCase()} ${SEQ}`]) {
        const panel = await search(page, q);
        await expect(option(panel, n), `${q} finds ${n}`).toBeVisible();
      }
      // The full number, and the result opens that exact record.
      const panel = await search(page, n);
      await option(panel, n).click();
      await page.waitForURL(new RegExp(`${esc(PAGE[prefix]!)}(\\?|#|$)`));
      await expectHealthy(page);
    });
  }
});

test('a prefix on its own (no digits) lists that kind of record: VX, RT, PRS, EP, GRN, V', async ({ page }) => {
  await as(page, 'administrator');
  await page.goto('/dashboard');
  for (const prefix of ['VX', 'RT', 'PRS', 'EP', 'GRN', 'INC', 'DLV', 'CTR', 'VIS', 'WC']) {
    const panel = await search(page, prefix);
    await expect(panel, `"${prefix}" must not come back empty`).not.toContainText('Nothing found for');
    await expect(panel.getByRole('option', { name: new RegExp(`^${prefix}-\\d{4}-\\d{6}`) }).first(), `"${prefix}" lists ${GROUP[prefix]}`).toBeVisible();
  }
  // One letter: the V-prefixed types (visits, vehicle exits), a few each.
  const panel = await search(page, 'V');
  await expect(panel.getByRole('option', { name: /^(VX|VIS)-\d{4}-\d{6}/ }).first()).toBeVisible();
  await expect(panel.getByRole('option')).not.toHaveCount(0);
  // A plate and a name still work.
  const plate = await search(page, 'srch731042');
  await expect(plate.getByRole('option', { name: /Honda Accord/ }).first()).toBeVisible();
});

test('the gate finds its own records but no workshop or store numbers', async ({ page }) => {
  await as(page, 'security-officer');
  await page.goto('/security');
  for (const prefix of ['VX', 'RT', 'VIS', 'INC']) {
    const panel = await search(page, num(prefix));
    await expect(option(panel, num(prefix))).toBeVisible();
  }
  for (const prefix of ['JC', 'SV', 'PRS', 'EPR', 'GRN', 'WR', 'WC', 'BC', 'RF']) {
    const panel = await search(page, num(prefix));
    await expect(panel, `security must not find ${prefix}`).toContainText('Nothing found for');
  }
  const panel = await search(page, SEQ);
  for (const prefix of ['JC', 'SV', 'PRS', 'GRN', 'WR']) await expect(panel).not.toContainText(num(prefix));
});

test('people who may not open a kind of record never find it', async ({ page }) => {
  // A calendar user: no security, workshop or store.
  await as(page, 'calendar-user');
  await page.goto('/dashboard');
  // 'VX-' (the prefix as numbers are written): a bare 'VX' can match another test's random tag in a name.
  for (const q of ['VX-', num('VX'), num('RT'), num('JC'), num('GRN')]) {
    const panel = await search(page, q);
    await expect(panel, `calendar user must not find "${q}"`).toContainText('Nothing found for');
  }
  // A technician in ANOTHER branch: not this branch's Job Card.
  await as(page, OTHER_BRANCH_TECH);
  await page.goto('/dashboard');
  let panel = await search(page, num('JC'));
  await expect(panel).toContainText('Nothing found for');
  // Another organisation's administrator: none of it.
  await page.goto('about:blank');
  await page.context().clearCookies();
  await signIn(page, OTHER_ORG_ADMIN.email, E2E_PASSWORD);
  for (const q of [num('VX'), num('JC'), num('BC'), SEQ]) {
    panel = await search(page, q);
    await expect(panel, `another organisation must not find "${q}"`).toContainText('Nothing found for');
  }
});
