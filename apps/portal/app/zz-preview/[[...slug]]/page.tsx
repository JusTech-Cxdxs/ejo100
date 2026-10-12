// TEMPORARY local render harness — never committed.
import { AppShell } from '@/components/AppShell';
import WorkshopPage from '@/app/(app)/workshop/page';
import RoadmapPage from '@/app/(app)/roadmap/page';
import { PageHeader, HeaderAction, StatTile, SectionCard, EmptyState, StatusChip, PriorityActions, BarRow, PageTitle, BackLink, Icon, NavCard } from '@/components/ui';
import { SecurityNav } from '@/components/SecurityNav';

const items = [
  { key: 'dashboard', name: 'Dashboard', href: '/zz-preview/dashboard', status: 'LIVE' },
  { key: 'notifications', name: 'Notifications', href: '/notifications', status: 'LIVE' },
  { key: 'analytics', name: 'Business Analytics', href: '/analytics', status: 'LIVE' },
  { key: 'workshop', name: 'Workshop', href: '/zz-preview/workshop', status: 'LIVE' },
  { key: 'inventory', name: 'Inventory', href: '/inventory', status: 'LIVE' },
  { key: 'warranty', name: 'Warranty', href: '/warranty', status: 'LIVE' },
  { key: 'security', name: 'Security', href: '/security', status: 'LIVE' },
  { key: 'scheduling', name: 'Scheduling', href: '/schedule', status: 'LIVE' },
  { key: 'organisation', name: 'Organisation', href: '/organisation', status: 'LIVE' },
  { key: 'users', name: 'Users', href: '/users', status: 'LIVE' },
  { key: 'roles', name: 'Roles', href: '/roles', status: 'LIVE' },
  { key: 'audit-logs', name: 'Audit Logs', href: '/audit-logs', status: 'LIVE' },
  { key: 'settings', name: 'Settings', href: '/settings', status: 'LIVE' },
];

function Dashboard() {
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader hero icon="dashboard" eyebrow="Monday 12 October" title="Dashboard" description="Good morning, Ada — here is what is happening across Kewalram Chanrai Group — Passenger Vehicle Workshop."
        meta={<a href="#attention" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ejo-warning)]/15 px-3 py-1 text-xs font-semibold text-[var(--ejo-warning-text)] ring-1 ring-inset ring-[var(--ejo-warning)]/30"><Icon name="bolt" size={13} />3 things need you</a>} />
      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile icon="clipboard" label="Active Job Cards" value={42} href="#" />
        <StatTile icon="garage" label="Job Cards in custody" value={17} href="#" />
        <StatTile icon="droplet" label="Vehicle Services in custody" value={9} href="#" />
        <StatTile icon="users" label="Total Customers" value={1284} href="#" />
        <StatTile icon="car" label="Total Vehicles Registered" value={1530} href="#" />
      </div>
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SectionCard id="attention" icon="bolt" tone="warning" title="Needs your attention" description="Each one stays here until it is done.">
          <div className="grid gap-2 sm:grid-cols-2">
            {['Approve Job Card JC-2026-0142', 'Assign a technician to JC-2026-0150', 'Pricing alert: Brake pads'].map((t) => (
              <a key={t} href="#" className="ejo-lift flex gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]"><Icon name="clipboard" size={16} /></span><span><span className="block font-medium">{t}</span><span className="block text-xs text-[var(--ejo-text-muted)]">Opened by Bola · 2 hours ago</span></span></a>
            ))}
          </div>
        </SectionCard>
        <SectionCard icon="activity" title="What’s new"><EmptyState compact icon="check-circle" title="Nothing new since you last looked." /></SectionCard>
      </div>
      <PriorityActions actions={[{ priority: 1, title: 'Collect ₦450,000 overdue for 60+ days', detail: '3 customers', href: '#' }, { priority: 2, title: 'Reorder 4 parts below safety stock', href: '#', items: [{ href: '#', label: 'Brake pads' }, { href: '#', label: 'Oil filter' }] }, { priority: 3, title: 'Review labour rates', href: '#' }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon="star" title="Top customers in the period">
          <div className="space-y-2">{[['Dangote Transport', 900], ['Ada Okafor', 520], ['Lagos Cabs Ltd', 310]].map(([n, v]) => <BarRow key={n as string} label={n} value={v as number} max={900} note={`₦${(v as number) * 1000}`} />)}</div>
        </SectionCard>
        <SectionCard icon="list" title="Job Cards" flush actions={<HeaderAction href="#">Open Job Card</HeaderAction>}>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--ejo-border)] text-left"><th className="px-4 py-3">Job #</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>{['CHECKED_IN', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CANCELLED', 'CLOSED'].map((s, i) => <tr key={s} className="border-b border-[var(--ejo-border)]"><td className="px-4 py-3 font-medium text-[var(--ejo-primary)]">JC-2026-01{i}</td><td className="px-4 py-3">Ada Okafor</td><td className="px-4 py-3"><StatusChip status={s} /></td></tr>)}</tbody></table></div>
        </SectionCard>
      </div>
    </div>
  );
}

function ListPage() {
  return (
    <div className="p-8">
      <BackLink href="#" label="Back to Security" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><PageTitle icon="badge">Visitors</PageTitle></div>
      <SecurityNav active="/security/visitors" />
      <EmptyState icon="badge" title="No visitors yet">Register the first visitor using the form.</EmptyState>
      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NavCard href="#" icon="receipt" title="Goods Receipts" description="A complete record of every delivery." badge={12} />
      </div>
    </div>
  );
}

export default async function Preview({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug?.[0] ?? 'dashboard';
  const content = slug === 'workshop' ? <WorkshopPage /> : slug === 'roadmap' ? <RoadmapPage /> : slug === 'list' ? <ListPage /> : <Dashboard />;
  return (
    <AppShell items={items} organisationName="Kewalram Chanrai Group" userName="Ada Okafor" roleName="Workshop Manager" initialCollapsed={slug === 'collapsed'}>
      {content}
    </AppShell>
  );
}
