/**
 * Fixtures for the security / concurrency tests — runs AFTER e2e/seed.ts on
 * the throw-away CI database (never a real one). Creates records of the FIRST
 * organisation in known states (so tests can (a) try to read them as another
 * organisation and (b) fire concurrent workflow actions at them), and writes
 * their ids to sec-fixtures.json.
 *
 * Also gives the second organisation's administrator role the same
 * permission grants as the first organisation's, so cross-organisation
 * tests use a FULLY privileged admin of another tenant (the strongest case).
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const D = (n: number) => new Prisma.Decimal(n);

async function main() {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  const other = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'other-org-e2e' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' } });
  const u = async (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const front = await u('frontdesk@e2e.test');
  const sup = await u('supervisor@e2e.test');
  const tech = await u('tech@e2e.test');
  const mgr = await u('manager@e2e.test');
  const fin = await u('finance@e2e.test');
  const store = await u('store@e2e.test');
  const admin = await u('admin@e2e.test');
  const master = await u('master@e2e.test');
  const otherAdmin = await u('other-admin@e2e.test');
  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: 'customer@e2e.test' } });
  const dept = await prisma.department.findUnique({ where: { branchId_slug: { branchId: branch.id, slug: 'workshop-passenger' } } });

  // Other organisation's admin: same grants as ours (role slug 'administrator').
  const ourAdminRole = await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId: org.id, slug: 'administrator' } }, include: { permissions: true } });
  const theirAdminRole = await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId: other.id, slug: 'administrator' } } });
  for (const rp of ourAdminRole.permissions) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: theirAdminRole.id, permissionId: rp.permissionId } }, update: {}, create: { roleId: theirAdminRole.id, permissionId: rp.permissionId } });
  }

  const vehicle = (plate: string) => prisma.customerVehicle.upsert({
    where: { plateNumber: plate }, update: {},
    create: { customerId: customer.id, make: 'Toyota', model: 'Camry', year: 2021, vehicleType: 'PASSENGER', plateNumber: plate, mileage: 10000, createdById: front.id },
  });
  const sameVehicle = await vehicle('SEC-SAME-01');
  const manyVehicles = await Promise.all(Array.from({ length: 15 }, (_, i) => vehicle(`SEC-NUM-${String(i + 1).padStart(2, '0')}`)));

  let n = 900000;
  const jobNumber = () => `JC-SEC-${String((n += 1))}`;
  const jobCard = async (plate: string, status: 'AWAITING_CUSTOMER_APPROVAL' | 'CANCELLED' | 'IN_PROGRESS' | 'CHECKED_OUT', total: number) => {
    const v = await vehicle(plate);
    const jc = await prisma.jobCard.create({
      data: {
        jobNumber: jobNumber(), branchId: branch.id, customerId: customer.id, vehicleId: v.id, departmentId: dept?.id ?? null,
        createdById: front.id, supervisorId: sup.id, assignedTechnicianId: tech.id, technicianAcceptanceStatus: 'ACCEPTED',
        status, approvalStatus: 'APPROVED', approvedById: sup.id, approvedAt: new Date(), complaint: 'Security test fixture',
        workStartedAt: status === 'IN_PROGRESS' ? new Date() : null,
      },
    });
    await prisma.estimate.create({
      data: {
        jobCardId: jc.id, status: 'MANAGER_APPROVED', createdById: tech.id, approvedById: sup.id, approvedAt: new Date(), managerApprovedById: mgr.id, managerApprovedAt: new Date(), customerNotifiedAt: new Date(), customerNotifiedById: fin.id,
        lineItems: { create: [{ type: 'LABOUR', description: 'Labour (fixture)', quantity: 1, unitPrice: D(total), amount: D(total), enteredById: tech.id, billTo: 'CUSTOMER' }] },
      },
    });
    return jc;
  };

  // Payments: 100,000 owed, awaiting the customer (deposit 70%).
  const jcPay = await jobCard('SEC-PAY-01', 'AWAITING_CUSTOMER_APPROVAL', 100000);
  const jcPay2 = await jobCard('SEC-PAY-02', 'AWAITING_CUSTOMER_APPROVAL', 100000);
  // Refunds: cancelled, 50,000 paid.
  const jcRefund = await jobCard('SEC-REF-01', 'CANCELLED', 100000);
  await prisma.payment.create({ data: { jobCardId: jcRefund.id, amount: D(50000), method: 'CASH', recordedById: fin.id, notes: 'fixture' } });
  // Print views exist only for finished records — one checked-out card, one collected service.
  const jcOut = await jobCard('SEC-OUT-01', 'CHECKED_OUT', 50000);
  await prisma.jobCard.update({ where: { id: jcOut.id }, data: { checkedOutAt: new Date(), collectedByName: 'Ada Customer', closedAt: new Date(), completedAt: new Date() } });
  // Stock: an open job with parts requests waiting for the Store.
  const jcSlips = await jobCard('SEC-SLIP-01', 'IN_PROGRESS', 100000);

  const part = async (name: string, partNumber: string, onHand: number, reserved = 0) => {
    const p = await prisma.part.upsert({
      where: { branchId_partNumber: { branchId: branch.id, partNumber } }, update: {},
      create: { branchId: branch.id, name, partNumber, baseUnitOfMeasure: 'piece', trackingType: 'QUANTITY', sellingPrice: D(5000), createdById: store.id },
    });
    await prisma.partStock.upsert({ where: { partId: p.id }, update: { quantityOnHand: D(onHand), quantityReserved: D(reserved) }, create: { partId: p.id, quantityOnHand: D(onHand), quantityReserved: D(reserved) } });
    return p;
  };
  const pApprove = await part('Brake pad (sec test)', 'SEC-P-APPROVE', 10);
  const pRelease = await part('Oil filter (sec test)', 'SEC-P-RELEASE', 5, 2);
  const pReceive = await part('Air filter (sec test)', 'SEC-P-RECEIVE', 0);

  let s = 0;
  const slip = (status: 'PENDING_STORE_APPROVAL' | 'APPROVED', partId: string, qty: number) => prisma.partRequestSlip.create({
    data: {
      referenceNumber: `PRS-SEC-${String((s += 1)).padStart(4, '0')}`, jobCardId: jcSlips.id, branchId: branch.id, requestedById: tech.id, status,
      hodApprovedById: sup.id, hodApprovedAt: new Date(), ...(status === 'APPROVED' ? { storeApprovedById: store.id, storeApprovedAt: new Date() } : {}),
      lines: { create: [{ partId, quantityRequested: D(qty) }] },
    },
  });
  const pendingSlips = [];
  for (let i = 0; i < 10; i += 1) pendingSlips.push(await slip('PENDING_STORE_APPROVAL', pApprove.id, 3));
  const approvedSlip = await slip('APPROVED', pRelease.id, 2);

  // Records to probe from the other organisation.
  const gr = await prisma.goodsReceipt.create({
    data: { branchId: branch.id, referenceNumber: 'GRN-SEC-000001', supplierName: 'Fixture Supplier Ltd', receivedById: store.id, lines: { create: [{ partId: pReceive.id, quantityReceivedInUnit: D(0), unitUsed: 'piece', quantityInBaseUnit: D(0) }] } },
  }).catch(async () => prisma.goodsReceipt.findUniqueOrThrow({ where: { referenceNumber: 'GRN-SEC-000001' } }));
  const vs = await prisma.vehicleService.create({ data: { serviceNumber: 'VS-SEC-000001', branchId: branch.id, customerId: customer.id, vehicleId: (await vehicle('SEC-VS-01')).id, createdById: front.id } });
  const vsDone = await prisma.vehicleService.create({ data: { serviceNumber: 'VS-SEC-000002', branchId: branch.id, customerId: customer.id, vehicleId: (await vehicle('SEC-VS-02')).id, createdById: front.id, status: 'COLLECTED' } });
  const provider = await prisma.warrantyProvider.upsert({ where: { name: 'Sec Test Motors Warranty' }, update: {}, create: { name: 'Sec Test Motors Warranty', type: 'MANUFACTURER', createdById: admin.id, organisationId: org.id } });
  const policy = await prisma.warrantyPolicy.upsert({ where: { code: 'SEC-POL-1' }, update: {}, create: { code: 'SEC-POL-1', name: 'Sec 12 month', kind: 'PART', providerId: provider.id, durationMonths: 12, coverageSummary: 'Fixture', createdById: admin.id, organisationId: org.id } });
  const warranty = await prisma.warranty.upsert({
    where: { warrantyNumber: 'WTY-SEC-000001' }, update: {},
    create: { warrantyNumber: 'WTY-SEC-000001', kind: 'PART', policyId: policy.id, providerId: provider.id, customerId: customer.id, subjectDescription: 'Fixture part', startsAt: new Date(), endsAt: new Date(Date.now() + 365 * 86400000), coverageSnapshot: 'Fixture', origin: 'MANUAL', jobCardId: jcSlips.id } as never,
  });
  const refund = await prisma.refund.create({ data: { referenceNumber: 'RF-SEC-000001', jobCardId: jcRefund.id, amount: D(1), method: 'CASH', paidToName: 'Ada Customer', reason: 'fixture', recordedById: fin.id } });
  const broadcast = await prisma.broadcast.create({ data: { broadcastNumber: 'BC-SEC-000001', organisationId: org.id, category: 'NEWS', title: 'Secret fixture broadcast', message: 'Only org one may read this', startsAt: new Date(), createdById: admin.id } });
  const appointment = await prisma.appointment.create({ data: { appointmentNumber: 'APT-SEC-000001', branchId: branch.id, title: 'Secret fixture meeting', ownerId: admin.id, createdById: admin.id, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000) } });

  const out = {
    orgId: org.id, otherOrgId: other.id, branchId: branch.id, customerId: customer.id, vehicleId: sameVehicle.id,
    users: { front: front.id, sup: sup.id, tech: tech.id, mgr: mgr.id, fin: fin.id, store: store.id, admin: admin.id, master: master.id, otherAdmin: otherAdmin.id },
    roles: { admin: ourAdminRole.id, tech: (await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId: org.id, slug: 'technician' } } })).id },
    sameVehicleId: sameVehicle.id, manyVehicleIds: manyVehicles.map((v) => v.id),
    jcPay: jcPay.id, jcPay2: jcPay2.id, jcRefund: jcRefund.id, jcSlips: jcSlips.id, jcOut: jcOut.id, vehicleServiceDone: vsDone.id,
    parts: { approve: pApprove.id, release: pRelease.id, receive: pReceive.id },
    pendingSlips: pendingSlips.map((x) => x.id), approvedSlip: approvedSlip.id,
    goodsReceipt: gr.id, vehicleService: vs.id, warranty: warranty.id, warrantyProvider: provider.id, warrantyPolicy: policy.id,
    refund: refund.id, broadcast: broadcast.id, appointment: appointment.id,
    markers: { jobNumber: jcPay.jobNumber, plate: 'SEC-PAY-01', customer: 'Ada Customer', broadcast: 'Secret fixture broadcast', appointment: 'Secret fixture meeting', supplier: 'Fixture Supplier Ltd' },
  };
  writeFileSync(process.env.SEC_FIXTURES ?? 'sec-fixtures.json', JSON.stringify(out, null, 1));
  // eslint-disable-next-line no-console
  console.log(`security fixtures: ${Object.keys(out).length} keys written`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
