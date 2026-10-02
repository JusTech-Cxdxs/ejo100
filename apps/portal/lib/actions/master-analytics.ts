'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { computeMasterAnalytics, type Job } from '@/lib/master-analytics';
import { lagosYmd } from '@/lib/nigeria-calendar';

const ALLOWED = ['administrator', 'workshop-manager', 'finance-officer'];
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function canSeeMasterAnalytics(): Promise<boolean> {
  const user = await requireUser();
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  return roles.some((r: { role: { slug: string; isSuperAdmin: boolean } }) => r.role.isSuperAdmin || ALLOWED.includes(r.role.slug));
}

const PERIODS = ['today', 'this_month', 'last_month', 'last_30', 'this_quarter', 'this_year', 'custom'] as const;
type PeriodKey = (typeof PERIODS)[number];

function periodRange(key: PeriodKey, now: Date, custom?: { from?: string; to?: string }): { from: Date; to: Date; label: string } {
  const ymd = lagosYmd(now);
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7));
  const at = (yy: number, mm: number) => new Date(`${yy}-${String(mm).padStart(2, '0')}-01T00:00:00+01:00`);
  const tomorrow = new Date(`${ymd}T00:00:00+01:00`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (key === 'today') return { from: new Date(`${ymd}T00:00:00+01:00`), to: tomorrow, label: 'Today' };
  if (key === 'custom' && custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from)) {
    const f = new Date(`${custom.from}T00:00:00+01:00`);
    const t = custom.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) && custom.to >= custom.from ? new Date(new Date(`${custom.to}T00:00:00+01:00`).getTime() + 86400000) : tomorrow;
    const fmt = (d: Date) => d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
    return { from: f, to: t, label: `${fmt(f)} – ${fmt(new Date(t.getTime() - 86400000))}` };
  }
  if (key === 'last_month') { const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1; return { from: at(ly, lm), to: at(y, m), label: at(ly, lm).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' }) }; }
  if (key === 'last_30') return { from: new Date(+tomorrow - 30 * 86400000), to: tomorrow, label: 'Last 30 days' };
  if (key === 'this_quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: at(y, qm), to: tomorrow, label: `Q${Math.floor((m - 1) / 3) + 1} ${y} to date` }; }
  if (key === 'this_year') return { from: at(y, 1), to: tomorrow, label: `${y} to date` };
  return { from: at(y, m), to: tomorrow, label: `${at(y, m).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' })} to date` };
}

const SLIP_JOB = { slipLine: { select: { slip: { select: { jobCardId: true, vehicleServiceId: true } } } } } as const;

export async function getMasterAnalytics(periodKey?: string, custom?: { from?: string; to?: string }) {
  if (!(await canSeeMasterAnalytics())) throw new Error('The master dashboard is for the Master Admin, Administrators, the Workshop Manager and Finance.');
  const now = new Date();
  const key = ((PERIODS as readonly string[]).includes(periodKey ?? '') ? periodKey : 'this_month') as PeriodKey;
  const { from, to, label } = periodRange(key, now, custom);
  const since = new Date(Math.min(+from - (+to - +from), +now - 100 * 86400000) - 86400000);

  const [jcs, svs, qty, batch, serial, eprs, grn, claims] = await Promise.all([
    prisma.jobCard.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { status: { notIn: ['CHECKED_OUT', 'CANCELLED', 'CLOSED'] } }, { checkedOutAt: { gte: since } }] },
      select: { id: true, jobNumber: true, status: true, createdAt: true, completedAt: true, checkedOutAt: true, closedAt: true, cancellationRequests: { where: { status: 'APPROVED' }, orderBy: { decidedAt: 'desc' }, take: 1, select: { decidedAt: true } }, customer: { select: { fullName: true } }, estimate: { select: { lineItems: { select: { type: true, amount: true, billTo: true } } } }, payments: { select: { amount: true, recordedAt: true } }, refunds: { select: { amount: true, recordedAt: true } } },
    }),
    prisma.vehicleService.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { status: { notIn: ['COLLECTED', 'CANCELLED', 'ESCALATED'] } }, { collectedAt: { gte: since } }] },
      select: { id: true, serviceNumber: true, status: true, createdAt: true, completedAt: true, collectedAt: true, closedAt: true, cancelledAt: true, customer: { select: { fullName: true } }, serviceEstimate: { select: { lineItems: { select: { type: true, amount: true } } } }, payments: { select: { amount: true, recordedAt: true } }, refunds: { select: { amount: true, recordedAt: true } } },
    }),
    prisma.partQuantityConsumption.findMany({ where: { consumedAt: { gte: since } }, select: { quantityTaken: true, goodsReceiptLine: { select: { unitCost: true } }, ...SLIP_JOB } }),
    prisma.partBatchConsumption.findMany({ where: { consumedAt: { gte: since } }, select: { quantityTaken: true, batch: { select: { goodsReceiptLine: { select: { unitCost: true } } } }, ...SLIP_JOB } }),
    prisma.partSerial.findMany({ where: { issuedToSlipLineId: { not: null } }, select: { goodsReceiptLine: { select: { unitCost: true } }, issuedToSlipLine: { select: { slip: { select: { jobCardId: true, vehicleServiceId: true } } } } } }),
    prisma.externalProcurementRequest.findMany({ where: { disbursedAmount: { not: null } }, select: { jobCardId: true, disbursedAmount: true } }),
    prisma.goodsReceiptLine.findMany({ where: { goodsReceipt: { receivedAt: { gte: since } } }, select: { totalCost: true, goodsReceipt: { select: { receivedAt: true } } } }),
    prisma.warrantyClaim.findMany({ where: { settledAt: { gte: since } }, select: { settledAt: true, settledAmount: true } }),
  ]);

  // Parts cost per job (actual goods-receipt cost), and issues with no cost.
  const cost = new Map<string, number>();
  const uncosted = new Map<string, number>();
  const add = (job: { jobCardId: string | null; vehicleServiceId: string | null } | undefined | null, qtyTaken: number, unitCost: unknown) => {
    const k = job?.jobCardId ? `JC:${job.jobCardId}` : job?.vehicleServiceId ? `SV:${job.vehicleServiceId}` : null;
    if (!k) return;
    if (unitCost === null || unitCost === undefined) uncosted.set(k, (uncosted.get(k) ?? 0) + 1);
    else cost.set(k, (cost.get(k) ?? 0) + qtyTaken * Number(unitCost));
  };
  for (const q of qty) add(q.slipLine.slip, Number(q.quantityTaken), q.goodsReceiptLine?.unitCost);
  for (const b of batch) add(b.slipLine.slip, Number(b.quantityTaken), b.batch.goodsReceiptLine?.unitCost);
  for (const s of serial) add(s.issuedToSlipLine?.slip, 1, s.goodsReceiptLine?.unitCost);
  const sublet = new Map<string, number>();
  for (const e of eprs) sublet.set(e.jobCardId, (sublet.get(e.jobCardId) ?? 0) + num(e.disbursedAmount));

  const jcCancelled = (j: { status: string; completedAt: Date | null; cancellationRequests: { decidedAt: Date | null }[] }) => {
    if (j.status === 'CANCELLED') return true;
    const c = j.cancellationRequests[0]?.decidedAt;
    return Boolean(c && (!j.completedAt || +new Date(c) > +new Date(j.completedAt)));
  };
  const pay = (xs: { amount: unknown; recordedAt: Date }[]) => xs.map((p) => ({ at: p.recordedAt, amount: num(p.amount) }));
  const jobs: Job[] = [
    ...jcs.map((j: (typeof jcs)[number]) => ({
      kind: 'JC' as const, id: j.id, number: j.jobNumber, customer: j.customer.fullName, status: j.status, openedAt: j.createdAt,
      // A cancelled hand-back (latest approved cancellation after its last
      // completion — even if it was later "checked out" to return the car)
      // earns nothing and owes nothing; its payments / refunds still count
      // as cash movements.
      finishedAt: jcCancelled(j) ? null : j.completedAt ?? j.checkedOutAt ?? j.closedAt ?? null,
      cancelled: jcCancelled(j),
      lines: (j.estimate?.lineItems ?? []).map((l: { type: string; amount: unknown; billTo: string }) => ({ type: l.type, amount: num(l.amount), billTo: l.billTo })),
      partsCost: cost.get(`JC:${j.id}`) ?? 0, partsIssuedWithoutCost: uncosted.get(`JC:${j.id}`) ?? 0, subletCost: sublet.get(j.id) ?? 0,
      payments: pay(j.payments), refunds: pay(j.refunds),
    })),
    // Escalated services moved to a Job Card — counted there, not twice.
    ...svs.filter((v: (typeof svs)[number]) => v.status !== 'ESCALATED').map((v: (typeof svs)[number]) => ({
      kind: 'SV' as const, id: v.id, number: v.serviceNumber, customer: v.customer.fullName, status: v.status, openedAt: v.createdAt,
      finishedAt: v.status === 'CANCELLED' || v.cancelledAt ? null : v.completedAt ?? v.collectedAt ?? v.closedAt ?? null,
      cancelled: v.status === 'CANCELLED' || Boolean(v.cancelledAt),
      lines: (v.serviceEstimate?.lineItems ?? []).map((l: { type: string; amount: unknown }) => ({ type: l.type, amount: num(l.amount), billTo: 'CUSTOMER' })),
      partsCost: cost.get(`SV:${v.id}`) ?? 0, partsIssuedWithoutCost: uncosted.get(`SV:${v.id}`) ?? 0, subletCost: 0,
      payments: pay(v.payments), refunds: pay(v.refunds),
    })),
  ];
  const analytics = computeMasterAnalytics({
    jobs,
    purchases: grn.map((g: (typeof grn)[number]) => ({ at: g.goodsReceipt.receivedAt, cost: num(g.totalCost) })),
    settlements: claims.map((c: (typeof claims)[number]) => ({ at: c.settledAt as Date, amount: num(c.settledAmount) })),
    from, to, now,
  });
  return { ...analytics, periodKey: key, periodLabel: label };
}
