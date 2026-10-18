import { allows, guardAnyPage } from '@/lib/authz/server';
import { listServiceJobs } from '@/lib/actions/service';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PageHeader, HeaderAction, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { SERVICE_JOB_STATUS_LABEL, SERVICE_KIND_LABEL, SERVICE_OPEN_STATUSES, type ServiceJobStatus, type ServiceJobKind } from '@/lib/service-core';
import { formatDateOnly, formatRelative } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Open' },
  ...SERVICE_OPEN_STATUSES.map((s) => ({ key: s, label: SERVICE_JOB_STATUS_LABEL[s] })),
  { key: 'RETURNED', label: 'Returned' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

/** The service jobs register: by status, searchable by job number, serial, product or customer. */
export default async function ServiceJobsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; mine?: string; error?: string }> }) {
  await guardAnyPage(['service.view'], '/service');
  const { q, status: rawStatus, mine, error } = await searchParams;
  const status = rawStatus && FILTERS.some((f) => f.key === rawStatus) ? rawStatus : '';
  const [jobs, canSeeCustomers, canManage] = await Promise.all([listServiceJobs({ q, status: status && status !== 'all' ? status : undefined, mine: mine === '1' }), allows('crm.view'), allows('service.manage')]);
  const shown = status === '' ? jobs.filter((j) => (SERVICE_OPEN_STATUSES as string[]).includes(j.status)) : jobs;
  const link = (extra: Record<string, string | null>) => `/service/jobs?${Object.entries({ q: q ?? null, status: status || null, mine: mine ?? null, ...extra }).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')}`;
  return (
    <div className="p-8">
      <PageHeader
        icon="wrench"
        back={{ href: '/service', label: 'Back to Service Centre' }}
        title="Service jobs"
        description="Every unit received for repair, from the day it came in to the day it went back. Open a job by serial — covered units get a warranty job, others a paid one."
        actions={canManage ? <HeaderAction href="/service/jobs/new">Open a service job</HeaderAction> : undefined}
      />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <LoadingLink key={f.key || 'open'} href={link({ status: f.key || null })} className={`rounded-full px-3 py-1 text-xs font-medium ${status === f.key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{f.label}</LoadingLink>
        ))}
        <LoadingLink href={link({ mine: mine === '1' ? null : '1' })} className={`rounded-full px-3 py-1 text-xs font-medium ${mine === '1' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Assigned to me</LoadingLink>
      </div>
      <form className="mb-4 flex gap-2" action="/service/jobs">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {mine ? <input type="hidden" name="mine" value={mine} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by job number, serial, product or customer…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {shown.length === 0 ? (
        <EmptyState icon="wrench" title="No service jobs in this view">{jobs.length === 0 ? 'When a unit comes back for repair, open a job for its serial.' : 'Try another status or clear the search.'}</EmptyState>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Technician</th>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((j) => (
                <tr key={j.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2">
                    <LoadingLink href={`/service/jobs/${j.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{j.number}</LoadingLink>
                    <div className="line-clamp-1 max-w-xs text-xs text-[var(--ejo-text-muted)]">{j.fault}</div>
                  </td>
                  <td data-label="Unit" className="px-3 py-2 text-[var(--ejo-text)]">{j.productName}<div className="text-xs text-[var(--ejo-text-muted)]">{j.serialNumber}</div></td>
                  <td data-label="Customer" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{j.customer ? <CustomerLink id={j.customer.id} name={j.customer.fullName} canView={canSeeCustomers} /> : <span className="text-[var(--ejo-text-muted)]">—</span>}</td>
                  <td data-label="Kind" className="px-3 py-2 text-xs text-[var(--ejo-text)]">
                    {SERVICE_KIND_LABEL[j.kind as ServiceJobKind]}
                    {j.kind === 'PAID' && j.quotedAmount !== null ? <div className="text-[var(--ejo-text-muted)]">{formatCurrency(j.paidAmount, 'NGN')} of {formatCurrency(j.quotedAmount, 'NGN')}</div> : null}
                  </td>
                  <td data-label="Technician" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{j.technicianName ?? <span className="text-[var(--ejo-warning)]">Not assigned</span>}</td>
                  <td data-label="Opened" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(j.createdAt)}<div>{formatRelative(j.updatedAt, new Date(), { short: true })}</div></td>
                  <td data-label="Status" className="px-3 py-2"><StatusChip status={j.status} label={SERVICE_JOB_STATUS_LABEL[j.status as ServiceJobStatus]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
