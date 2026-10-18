import Link from 'next/link';
import { requireCustomer } from '@/lib/customer-portal/session';
import { loadClaims, loadDevices, serviceStatusForCustomer, type ServiceJobItem, type ClaimItem } from '@/lib/customer-portal/zinox-data';
import { fmtDate, naira } from '@/lib/customer-portal/format';
import { CLAIM_STATUS, CUSTOMER_RESOLUTION } from '@/lib/customer-portal/status';
import { Badge, Card, EmptyState, KeyValue, PageHero, SectionTitle, Stepper } from '@/components/customer/ui';
import { Icon } from '@/components/customer/Icon';
import { ReportFaultForm } from '@/components/customer/zinox/forms';

export const metadata = { title: 'Claims and repairs' };

const STEPS = ['Received', 'Diagnosis', 'Repair', 'Final checks', 'Ready', 'Collected'] as const;
const STEP_INDEX: Record<string, number> = { OPEN: 0, ASSIGNED: 1, DIAGNOSED: 1, AWAITING_PARTS: 2, REPAIRING: 2, QA: 3, READY: 4, RETURNED: 5, CLOSED: 5, CANCELLED: 0 };

function JobCard({ j, delay }: { j: ServiceJobItem; delay: number }) {
  const st = serviceStatusForCustomer(j.status);
  const active = !['RETURNED', 'CLOSED', 'CANCELLED'].includes(j.status);
  const balance = j.quoted !== null ? Math.max(0, j.quoted - j.paid) : null;
  return (
    <Card as="article" className="ejo-rise p-4 sm:p-5" delay={delay}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ejo-text)]">{j.number} · {j.product}</p>
          <p className="text-xs text-[var(--ejo-text-muted)]">Serial <span className="font-mono">{j.serial}</span> · received {fmtDate(j.createdAt)} · {j.kind === 'WARRANTY' ? 'under warranty' : j.kind === 'GOODWILL' ? 'goodwill repair' : 'paid repair'}{j.claimNumber ? ` · claim ${j.claimNumber}` : ''}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-3"><Stepper steps={STEPS} current={STEP_INDEX[j.status] ?? 0} compact cancelled={j.status === 'CANCELLED'} /></div>
      <p className="mt-2 text-sm text-[var(--ejo-text)]">{st.explain}</p>
      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Reported: {j.fault}</p>
      {j.kind === 'PAID' && active ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <KeyValue label="Quoted">{j.quoted === null ? 'Not yet' : naira(j.quoted)}</KeyValue>
          <KeyValue label="Paid">{naira(j.paid)}</KeyValue>
          <KeyValue label="To pay before collection">{balance === null ? '—' : naira(balance)}</KeyValue>
        </div>
      ) : null}
      {j.returnedAt ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Collected {fmtDate(j.returnedAt)}.</p> : null}
    </Card>
  );
}

function ClaimRow({ c }: { c: ClaimItem }) {
  const st = CLAIM_STATUS[c.status] ?? { label: c.status.toLowerCase().replace(/_/g, ' '), tone: 'neutral' as const, explain: '' };
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--ejo-text)]">{c.number}{c.product ? ` · ${c.product}` : ''}</p>
        <p className="text-xs text-[var(--ejo-text-muted)]">{c.serial ? <>Serial <span className="font-mono">{c.serial}</span> · </> : null}warranty <Link href="/customer-portal/dashboard/warranties" className="font-medium text-[var(--ejo-primary)] hover:underline">{c.warrantyNumber}</Link> · reported {fmtDate(c.createdAt)}</p>
        <p className="mt-1 text-xs text-[var(--ejo-text)]">{c.complaint}</p>
        {st.explain ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{st.explain}</p> : null}
        {c.resolution ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Outcome: {CUSTOMER_RESOLUTION[c.resolution] ?? c.resolution}</p> : null}
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
    </li>
  );
}

/** The customer's product warranty claims and service jobs, and "Report a fault" on one of their devices. */
export default async function ClaimsPage() {
  const me = await requireCustomer();
  const [{ claims, jobs }, devices] = await Promise.all([loadClaims(me.id), loadDevices(me.id)]);
  const active = jobs.filter((j) => !['RETURNED', 'CLOSED', 'CANCELLED'].includes(j.status));
  const past = jobs.filter((j) => ['RETURNED', 'CLOSED', 'CANCELLED'].includes(j.status));
  const reportable = devices.filter((d) => !d.openJob).map((d) => ({ id: d.id, label: `${d.product} — ${d.serial}`, covered: d.cover.state === 'active' || d.cover.state === 'expiring' }));
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Claims and repairs" icon="wrench" title="Claims and repairs" subtitle="Report a fault on one of your devices, then follow the repair from the day the Service Centre receives it to the day it is ready." />
      <Card className="p-4 sm:p-6">
        <SectionTitle icon="alert" title="Report a fault" />
        {reportable.length ? (
          <>
            <p className="mb-4 text-sm text-[var(--ejo-text-muted)]">A device under warranty gets a warranty claim and a repair at no cost (unless the fault is user damage). Out of warranty, the Service Centre quotes first and repairs once you approve.</p>
            <ReportFaultForm devices={reportable} />
          </>
        ) : (
          <p className="text-sm text-[var(--ejo-text-muted)]">{devices.length ? 'Every device of yours is already at the Service Centre.' : <>Register your devices first on the <Link href="/customer-portal/dashboard/devices" className="font-medium text-[var(--ejo-primary)] hover:underline">Devices</Link> page.</>}</p>
        )}
      </Card>
      {active.length ? <section><SectionTitle icon="wrench" title={`At the Service Centre (${active.length})`} /><div className="space-y-4">{active.map((j, i) => <JobCard key={j.id} j={j} delay={Math.min(i, 8) * 40} />)}</div></section> : null}
      <section>
        <SectionTitle icon="shield" title={`Warranty claims (${claims.length})`} />
        {claims.length ? <Card className="px-4 sm:px-5"><ul className="divide-y divide-[var(--ejo-border)]">{claims.map((c) => <ClaimRow key={c.id} c={c} />)}</ul></Card> : <EmptyState icon="shield" title="No warranty claims" text="When you report a fault on a device under warranty, the claim appears here with its progress." />}
      </section>
      {past.length ? (
        <section>
          <SectionTitle icon="check" title={`Past repairs (${past.length})`} />
          <ul className="space-y-2">{past.map((j) => { const st = serviceStatusForCustomer(j.status); return <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm"><span className="inline-flex items-center gap-2 text-[var(--ejo-text)]"><Icon name="wrench" size={14} /> {j.number} · {j.product} <span className="text-xs text-[var(--ejo-text-muted)]">· {fmtDate(j.createdAt)}</span></span><Badge tone={st.tone}>{st.label}</Badge></li>; })}</ul>
        </section>
      ) : null}
      {jobs.length === 0 && claims.length === 0 ? <EmptyState icon="wrench" title="No repairs yet" text="Nothing has been to the Service Centre. If a device develops a fault, report it above." /> : null}
    </div>
  );
}
