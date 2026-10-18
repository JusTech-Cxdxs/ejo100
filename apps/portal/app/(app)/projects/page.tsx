import { allows, guardAnyPage } from '@/lib/authz/server';
import { listProjects, getProjectKpis } from '@/lib/actions/projects';
import { OrgTrail } from '@/components/OrgTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { DeliveryProgress } from '@/components/projects/DeliveryProgress';
import { PageHeader, HeaderAction, StatTile, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_KIND_LABEL, type ProjectStatus, type ProjectKind } from '@/lib/projects-core';
import { formatDateOnly } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

/** Projects home: contract value awarded this year, deliveries due, and the register with a status filter. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['projects.view'], '/projects');
  const { q, status: rawStatus, error } = await searchParams;
  const status = rawStatus && PROJECT_STATUS_LABEL[rawStatus as ProjectStatus] ? rawStatus : '';
  const [projects, kpis, canManage, canSeeCustomers] = await Promise.all([listProjects({ q, status: status || undefined }), getProjectKpis(), allows('projects.manage'), allows('crm.view')]);
  const link = (extra: Record<string, string | null>) => `/projects?${Object.entries({ q: q ?? null, status: status || null, ...extra }).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')}`;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="handshake"
        eyebrow="Module · Projects"
        title="Projects"
        description={<>Government and corporate contracts: tender, award, milestones, deliverables per site, the orders and builds behind them, and the acceptance certificate. <span className="block text-xs"><OrgTrail area="Projects" /></span></>}
        actions={canManage ? <HeaderAction href="/projects/new">New project</HeaderAction> : undefined}
      />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="money" label={`Contract value awarded ${kpis.year}`} value={formatCurrency(kpis.awardedThisYear, 'NGN')} hint="awarded or beyond, starting this year" tone="brand" />
        <StatTile icon="handshake" label="Projects live" value={kpis.live} hint="awarded or being delivered" href="/projects?status=IN_PROGRESS" tone="info" />
        <StatTile icon="truck" label="Deliveries due" value={kpis.deliveriesDue} hint="deliverables not yet accepted" tone={kpis.deliveriesDue ? 'warning' : 'neutral'} />
        <StatTile icon="calendar" label="Milestones due" value={kpis.milestonesDue} hint="within 7 days or overdue" tone={kpis.milestonesDue ? 'warning' : 'neutral'} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href={link({ status: null })} className={`rounded-full px-3 py-1 text-xs font-medium ${!status ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>All ({projects.length})</LoadingLink>
        {PROJECT_STATUSES.map((s) => (
          <LoadingLink key={s} href={link({ status: s })} className={`rounded-full px-3 py-1 text-xs font-medium ${status === s ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{PROJECT_STATUS_LABEL[s]}</LoadingLink>
        ))}
      </div>
      <form className="mb-4 flex gap-2" action="/projects">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by project number, name, tender reference or customer…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {projects.length === 0 ? (
        <EmptyState icon="handshake" title="No projects in this view">{canManage ? 'Record a tender or an awarded contract with "New project".' : 'Projects appear here once a Project Manager records them.'}</EmptyState>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Project</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2 text-right">Contract value</th><th className="px-3 py-2">Dates</th><th className="px-3 py-2">Delivery</th><th className="px-3 py-2">Manager</th><th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/projects/${p.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.number}</LoadingLink><div className="text-xs text-[var(--ejo-text)]">{p.name}</div>{p.overdueMilestones ? <div className="text-xs text-[var(--ejo-error)]">{p.overdueMilestones} overdue {p.overdueMilestones === 1 ? 'milestone' : 'milestones'}</div> : null}</td>
                  <td data-label="Customer" className="px-3 py-2 text-xs"><CustomerLink id={p.customer.id} name={p.customer.fullName} canView={canSeeCustomers} /></td>
                  <td data-label="Kind" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{PROJECT_KIND_LABEL[p.kind as ProjectKind]}</td>
                  <td data-label="Contract value" className="px-3 py-2 text-right text-[var(--ejo-text)]">{formatCurrency(p.contractValue, p.currency)}</td>
                  <td data-label="Dates" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{p.startDate ? formatDateOnly(p.startDate) : '—'} – {p.endDate ? formatDateOnly(p.endDate) : '—'}</td>
                  <td data-label="Delivery" className="px-3 py-2"><DeliveryProgress progress={p.progress} compact /></td>
                  <td data-label="Manager" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{p.manager.fullName}</td>
                  <td data-label="Status" className="px-3 py-2"><StatusChip status={p.status} label={PROJECT_STATUS_LABEL[p.status as ProjectStatus]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
