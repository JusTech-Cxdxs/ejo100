import { allows, guardAnyPage } from '@/lib/authz/server';
import { getServiceHome } from '@/lib/actions/service';
import { OrgTrail } from '@/components/OrgTrail';
import { PageHeader, HeaderAction, NavCard, StatTile, type IconName } from '@/components/ui';
import { SERVICE_JOB_STATUS_LABEL, type ServiceJobStatus } from '@/lib/service-core';

const SECTIONS: { name: string; href: string; desc: string; icon: IconName; needs: 'service.view' | 'warranty.view' | 'ledger' }[] = [
  { name: 'Service jobs', href: '/service/jobs', icon: 'wrench', desc: 'Every unit at the Service Centre: open, assigned, in repair, at quality check, ready for collection.', needs: 'service.view' },
  { name: 'Product warranties', href: '/service/warranties', icon: 'shield', desc: 'Warranties by serial — register a unit under its policy, see what is ending soon.', needs: 'warranty.view' },
  { name: 'Warranty claims', href: '/service/claims', icon: 'file', desc: 'Product warranty claims: log a claim for a covered serial and follow its approval.', needs: 'warranty.view' },
  { name: 'Warranty ledger', href: '/service/ledger', icon: 'money', desc: 'What warranty cases cost and which department carries each one, this month and this year.', needs: 'ledger' },
];

/** Service Centre home: open jobs by status, what needs attention, and the sections this person may open. */
export default async function ServiceHomePage() {
  await guardAnyPage(['service.view'], '/service');
  const [home, canWarranty, canLedger, canManage] = await Promise.all([
    getServiceHome(),
    allows('warranty.view'),
    Promise.all([allows('warranty.claim.approve'), allows('service.manage')]).then((xs) => xs.some(Boolean)),
    allows('service.manage'),
  ]);
  const visible = SECTIONS.filter((s) => (s.needs === 'service.view') || (s.needs === 'warranty.view' && canWarranty) || (s.needs === 'ledger' && canLedger));
  const c = home.counts;
  const inRepair = c.ASSIGNED + c.DIAGNOSED + c.REPAIRING;
  const statusTiles: { status: ServiceJobStatus; tone: 'primary' | 'info' | 'warning' | 'success' | 'neutral' }[] = [
    { status: 'OPEN', tone: 'warning' }, { status: 'ASSIGNED', tone: 'info' }, { status: 'DIAGNOSED', tone: 'info' }, { status: 'AWAITING_PARTS', tone: 'warning' }, { status: 'REPAIRING', tone: 'info' }, { status: 'QA', tone: 'primary' }, { status: 'READY', tone: 'success' },
  ];
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="wrench"
        eyebrow="Module · Service Centre"
        title="Service Centre"
        description={<>Units back from customers: diagnosis, parts, repair, quality check and return — under warranty, paid, or as goodwill. <span className="block text-xs"><OrgTrail area="Service Centre" /></span></>}
        actions={canManage ? <HeaderAction href="/service/jobs/new">Open a service job</HeaderAction> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="wrench" label="Units at the Service Centre" value={home.open} hint={home.oldestUnassignedDays !== null && c.OPEN ? `oldest unassigned: ${home.oldestUnassignedDays} ${home.oldestUnassignedDays === 1 ? 'day' : 'days'}` : 'open jobs'} href="/service/jobs" tone="brand" />
        <StatTile icon="package" label="Awaiting parts" value={c.AWAITING_PARTS} hint="repairs waiting for parts" href="/service/jobs?status=AWAITING_PARTS" tone={c.AWAITING_PARTS ? 'warning' : 'neutral'} />
        <StatTile icon="check-circle" label="Ready for collection" value={c.READY} hint="passed quality check" href="/service/jobs?status=READY" tone={c.READY ? 'success' : 'neutral'} />
        {canWarranty ? <StatTile icon="shield-check" label="Claims to approve" value={home.claimsToApprove} hint="product warranty claims awaiting approval" href="/warranty/claims?group=approval" tone={home.claimsToApprove ? 'warning' : 'neutral'} /> : <StatTile icon="clipboard" label="In repair" value={inRepair} hint="assigned, diagnosed or repairing" href="/service/jobs?status=REPAIRING" tone="info" />}
      </div>

      <div className="mb-8 flex flex-wrap gap-2 text-xs">
        {statusTiles.map((t) => (
          <a key={t.status} href={`/service/jobs?status=${t.status}`} className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1 font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]">
            {SERVICE_JOB_STATUS_LABEL[t.status]} <span className="text-[var(--ejo-text-muted)]">({c[t.status]})</span>
          </a>
        ))}
        {canWarranty ? <a href="/service/warranties?expiring=1" className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1 font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]">Warranties ending within 30 days <span className="text-[var(--ejo-text-muted)]">({home.expiring})</span></a> : null}
      </div>

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} />
        ))}
      </div>
    </div>
  );
}
