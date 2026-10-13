import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getCustomer360, getCustomerActivity } from '@/lib/actions/crm';
import {
  setCustomerPortalAccessFormAction, sendCustomerSetPasswordLinkFormAction, customerAddressFormAction, customerContactFormAction, customerNoteFormAction,
} from '@/lib/actions/crm-form-handlers';
import { CUSTOMER_ACTION_LABEL, JOB_STATUS_LABEL, WARRANTY_STATUS_LABEL, customerActionLabel, describeChanges, jobTone, naira } from '@/lib/crm';
import { CLAIM_STATUS_LABEL } from '@/lib/warranty-claim-status';
import { humanizeAction } from '@/lib/humanize-action';
import { formatDateOnly, formatDateTime, formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { Avatar } from '@/components/Avatar';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { CrmIcon, type CrmIconName } from '@/components/crm/CrmIcon';
import { Chip, Empty, Kpi, NoticeBox, Section, type Notice } from '@/components/crm/ui';
import { SpendChart } from '@/components/crm/LazyCrmCharts';
import { EditCustomerForm } from '@/components/crm/EditCustomerForm';

export const metadata = { title: 'Customer' };

const TABS: { key: string; label: string; icon: CrmIconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'chart' },
  { key: 'vehicles', label: 'Vehicles', icon: 'car' },
  { key: 'jobs', label: 'Jobs & services', icon: 'wrench' },
  { key: 'payments', label: 'Payments & refunds', icon: 'receipt' },
  { key: 'warranties', label: 'Warranties & claims', icon: 'shield' },
  { key: 'contacts', label: 'Contacts & addresses', icon: 'map' },
  { key: 'notes', label: 'Notes', icon: 'note' },
  { key: 'activity', label: 'Activity', icon: 'activity' },
];

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const ghost = 'inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] transition hover:border-[var(--ejo-primary)]/50 hover:text-[var(--ejo-primary)]';
const primary = 'inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95';

const STATUS: Record<string, Notice> = {
  registered: { kind: 'success', title: 'Customer registered', text: 'A welcome email with a link to set their own password (valid 72 hours) is on its way.' },
  registered_no_email: { kind: 'warning', title: 'Customer registered, but the welcome email was not sent', text: 'The mail server did not accept it — see Settings → Email delivery. Use “Send set-password link” once email is working.' },
  existing: { kind: 'success', title: 'This customer was already registered', text: 'That email belongs to this customer — no duplicate was created.' },
  saved: { kind: 'success', title: 'Changes saved', text: 'Every change is in the Activity tab, with who made it and when.' },
  unchanged: { kind: 'success', title: 'Nothing to save', text: 'No details were changed.' },
  access_off: { kind: 'success', title: 'Portal access switched off', text: 'They were signed out everywhere at once, and any unused set-password link stopped working.' },
  access_on: { kind: 'success', title: 'Portal access switched on', text: 'Send them a set-password link if they have not chosen a password yet.' },
  link_sent: { kind: 'success', title: 'Set-password link sent', text: 'Valid for 72 hours. Any earlier link no longer works.' },
  link_failed: { kind: 'warning', title: 'The set-password link could not be emailed', text: 'The mail server did not accept it — see Settings → Email delivery for the reason.' },
  address_add: { kind: 'success', title: 'Address added' },
  address_update: { kind: 'success', title: 'Address updated' },
  address_remove: { kind: 'success', title: 'Address removed' },
  contact_add: { kind: 'success', title: 'Contact person added' },
  contact_update: { kind: 'success', title: 'Contact person updated' },
  contact_remove: { kind: 'success', title: 'Contact person removed' },
  note_add: { kind: 'success', title: 'Note added' },
  note_pin: { kind: 'success', title: 'Note pinned to the top' },
  note_unpin: { kind: 'success', title: 'Note unpinned' },
  note_delete: { kind: 'success', title: 'Note deleted' },
};

const METHOD: Record<string, string> = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash' };

export default async function Customer360Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; edit?: string; status?: string; error?: string }> }) {
  await guardPage('crm.view', '/crm');
  const { id } = await params;
  const sp = await searchParams;
  const data = await getCustomer360(id);
  if (!data) notFound();
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : 'overview';
  const activity = tab === 'activity' ? await getCustomerActivity(id, 300) : [];
  const { customer: c, portal, money, can } = data;
  const base = `/crm/customers/${c.id}`;
  const notice: Notice | null = sp.error ? { kind: 'error', title: 'That didn’t work', text: sp.error } : sp.status ? STATUS[sp.status] ?? null : null;
  const editing = sp.edit === '1' && can.manage;
  const pinned = data.notes.filter((n) => n.pinned);
  const openJobs = data.jobs.filter((j) => j.open);
  const tel = (p: string) => `tel:${p.replace(/\s+/g, '')}`;

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <Link href="/crm" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Customers</Link>

      {/* Hero */}
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-5 sm:p-7">
        <div className="ejo-orb pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
        <div className="ejo-orb pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" style={{ animationDelay: '-5s' }} aria-hidden="true" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={c.fullName} size={64} active={c.isActive} />
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold text-[var(--ejo-text)] sm:text-3xl">{c.fullName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Chip tone="muted"><CrmIcon name={c.customerType === 'ORGANIZATION' ? 'building' : 'user'} size={11} />{c.customerType === 'ORGANIZATION' ? 'Organisation' : 'Individual'}</Chip>
                {c.company ? <Chip tone="muted">{c.company.companyName}{c.company.taxId ? ` · TIN ${c.company.taxId}` : ''}</Chip> : null}
                {c.isActive ? <Chip tone="success">Active</Chip> : <Chip tone="error">Portal access off</Chip>}
                {c.isActive ? (portal.lastSignIn ? <Chip tone="success">Last signed in {formatDateTimeCompact(portal.lastSignIn)}</Chip> : <Chip tone="muted">Never signed in</Chip>) : null}
                {openJobs.length ? <Chip tone="brand">{pluralize(openJobs.length, 'job')} in the workshop</Chip> : null}
                {c.tags.map((t) => <Link key={t} href={`/crm?tag=${encodeURIComponent(t)}`} prefetch={false}><Chip tone="info"><CrmIcon name="tag" size={11} />{t}</Chip></Link>)}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[var(--ejo-text)]">
                <li className="flex min-w-0 items-center gap-1.5"><CrmIcon name="phone" size={14} className="shrink-0 text-[var(--ejo-text-muted)]" />{c.phone ? <a href={tel(c.phone)} className="hover:text-[var(--ejo-primary)]">{c.phone}</a> : <span className="text-[var(--ejo-warning)]">No phone</span>}{c.altPhone ? <> · <a href={tel(c.altPhone)} className="hover:text-[var(--ejo-primary)]">{c.altPhone}</a></> : null}</li>
                <li className="flex min-w-0 items-center gap-1.5"><CrmIcon name="mail" size={14} className="shrink-0 text-[var(--ejo-text-muted)]" /><a href={`mailto:${c.email}`} className="truncate hover:text-[var(--ejo-primary)]">{c.email}</a></li>
                <li className="flex min-w-0 items-center gap-1.5"><CrmIcon name="map" size={14} className="shrink-0 text-[var(--ejo-text-muted)]" />{c.address ? <span className="break-words">{c.address}</span> : <span className="text-[var(--ejo-warning)]">No primary address</span>}</li>
              </ul>
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Customer since {formatDateOnly(c.createdAt)}{c.createdBy ? ` · registered by ${c.createdBy}` : ''}</p>
            </div>
          </div>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 md:max-w-xs md:justify-end">
            {can.openJobs ? <Link href="/workshop/job-cards" className={primary}><CrmIcon name="wrench" size={14} />Open Job Card</Link> : null}
            {can.openJobs ? <Link href={`${base}?tab=vehicles`} className={ghost}><CrmIcon name="calendar" size={14} />Book a service</Link> : null}
            {c.phone ? <a href={tel(c.phone)} className={ghost}><CrmIcon name="phone" size={14} />Call</a> : null}
            <a href={`mailto:${c.email}`} className={ghost}><CrmIcon name="mail" size={14} />Email</a>
            {can.broadcast ? <Link href={`/notifications/broadcasts/new?for=customers&customerId=${encodeURIComponent(c.id)}`} className={ghost}><CrmIcon name="broadcast" size={14} />Send a message</Link> : null}
            {can.manage && !editing ? <Link href={`${base}?edit=1`} className={ghost}><CrmIcon name="edit" size={14} />Edit details</Link> : null}
          </div>
        </div>
      </section>

      {notice ? <NoticeBox n={notice} /> : null}
      {c.gaps.length ? (
        <NoticeBox n={{ kind: 'warning', title: `Profile gap: no ${c.gaps.join(' or ')}`, text: can.manage ? <>Registration now requires both. <Link href={`${base}?edit=1`} className="font-medium text-[var(--ejo-primary)] hover:underline">Add {c.gaps.length > 1 ? 'them' : 'it'} now</Link> — nothing else is blocked meanwhile.</> : 'Registration now requires both — ask front desk to complete the profile.' }} />
      ) : null}

      {editing ? (
        <Section icon="edit" title="Edit details" subtitle="Every change is recorded in the Activity tab — who, when, before and after." className="mt-6">
          <EditCustomerForm cancelHref={base} customer={{ id: c.id, fullName: c.fullName, customerType: c.customerType, email: c.email, phone: c.phone, altPhone: c.altPhone, address: c.address, tags: c.tags, notifyByEmail: c.notifyByEmail, companyName: c.company?.companyName ?? null, taxId: c.company?.taxId ?? null }} />
        </Section>
      ) : null}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon="wallet" label="Lifetime spend" value={money.netPaid} format="naira" hint={`Paid ${naira(money.paidIn)} in total`} delay={0} />
        <Kpi icon="alert" label="Outstanding" value={money.outstanding} format="naira" tone={money.outstanding > 0 ? 'warning' : undefined} hint="Still owed on finished work" href={`${base}?tab=jobs`} delay={40} />
        <Kpi icon="refund" label="Refunds" value={money.refunded} format="naira" hint="Money returned to them" href={`${base}?tab=payments`} delay={80} />
        <Kpi icon="calendar" label="Visits" value={money.visits} hint={money.lastVisit ? `Last: ${formatDateOnly(money.lastVisit)}` : 'No visits yet'} href={`${base}?tab=jobs`} delay={120} />
        <Kpi icon="car" label="Vehicles" value={data.vehicles.length} hint={data.vehicles.length ? data.vehicles.slice(0, 2).map((v) => v.plateNumber || v.make).filter(Boolean).join(', ') : 'None registered'} href={`${base}?tab=vehicles`} delay={160} />
        <Kpi icon="receipt" label="Average job" value={money.averageJob} format="naira" hint={`${pluralize(money.finishedJobs, 'finished job')}`} delay={200} />
        <Kpi icon="clock" label="Average turnaround" value={money.averageTurnaroundDays} format="days" hint="Received → completed" delay={240} />
        <Kpi icon="shield" label="Warranties active" value={money.activeWarranties} hint={`${pluralize(data.warranties.length, 'warranty', 'warranties')} in all`} href={`${base}?tab=warranties`} delay={280} />
      </div>
      {data.scope.branchOnly ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Visits, jobs and money show {data.scope.branchName} only — the branch you work in.</p> : null}

      {/* Tabs */}
      <nav aria-label="Customer sections" className="mt-6">
        <ul className="flex flex-wrap gap-1 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link href={t.key === 'overview' ? base : `${base}?tab=${t.key}`} scroll={false} aria-current={tab === t.key ? 'page' : undefined} className={`flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-sm font-medium transition sm:min-h-0 ${tab === t.key ? 'bg-[var(--ejo-primary)] text-white shadow-sm' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}>
                <CrmIcon name={t.icon} size={14} />{t.label}
                {t.key === 'notes' && data.notes.length ? <span className={`rounded-full px-1.5 text-[10px] ${tab === t.key ? 'bg-white/25' : 'bg-[var(--ejo-bg)]'}`}>{data.notes.length}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-4">
        {tab === 'overview' ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
              <Section icon="chart" title="Spend over the last 12 months" subtitle="Paid in each month (net of refunds), and work billed to them when it was finished · Lagos calendar months">
                {data.months.some((m) => m.net || m.billed) ? <SpendChart data={data.months} /> : <Empty icon="chart" title="No money in or out in the last 12 months." />}
              </Section>
              <Section icon="wrench" title="Recent jobs & services" action={<Link href={`${base}?tab=jobs`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">All {data.jobs.length} →</Link>}>
                <JobList jobs={data.jobs.slice(0, 5)} />
              </Section>
            </div>
            <div className="min-w-0 space-y-6">
              <PortalCard data={data} base={base} />
              {pinned.length ? (
                <Section icon="pin" title="Pinned notes" action={<Link href={`${base}?tab=notes`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">All notes →</Link>}>
                  <ul className="space-y-2">{pinned.slice(0, 3).map((n) => <li key={n.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/[0.06] p-3 text-sm"><p className="whitespace-pre-line break-words text-[var(--ejo-text)]">{n.body}</p><p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{n.author} · {formatDateTimeCompact(n.createdAt)}</p></li>)}</ul>
                </Section>
              ) : null}
              <Section icon="car" title="Vehicles" action={<Link href={`${base}?tab=vehicles`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Details →</Link>}>
                {data.vehicles.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No vehicles registered yet.</p> : (
                  <ul className="space-y-2">{data.vehicles.slice(0, 4).map((v) => (
                    <li key={v.id}><Link href={`/workshop/vehicles/${v.id}/edit`} prefetch={false} className="flex items-center justify-between gap-2 rounded-[var(--ejo-radius-md)] px-2 py-1.5 text-sm hover:bg-[var(--ejo-bg)]"><span className="min-w-0 truncate"><span className="font-medium text-[var(--ejo-text)]">{v.plateNumber || v.chassisNumber || 'No plate'}</span> <span className="text-[var(--ejo-text-muted)]">{[v.year, v.make, v.model].filter(Boolean).join(' ')}</span></span><span className="shrink-0 text-xs text-[var(--ejo-text-muted)]">{pluralize(v.jobs, 'visit')}</span></Link></li>
                  ))}</ul>
                )}
              </Section>
            </div>
          </div>
        ) : null}

        {tab === 'vehicles' ? (
          <Section icon="car" title={`Vehicles (${data.vehicles.length})`} subtitle="Each opens its own vehicle page with service health and analytics." action={can.openJobs ? <Link href="/workshop/vehicles" className={ghost}><CrmIcon name="plus" size={14} />Register a vehicle</Link> : undefined}>
            {data.vehicles.length === 0 ? <Empty icon="car" title="No vehicles registered for this customer yet." text="Register one from Workshop → Vehicles, choosing this customer as the owner." /> : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.vehicles.map((v) => (
                  <li key={v.id} className="flex flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none">
                    <Link href={`/workshop/vehicles/${v.id}/edit`} prefetch={false} className="group min-w-0">
                      <p className="flex items-center gap-2 text-base font-semibold text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]"><CrmIcon name="car" size={16} />{v.plateNumber || v.chassisNumber || 'No plate'}</p>
                      <p className="truncate text-sm text-[var(--ejo-text-muted)]">{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {v.vehicleType ? <Chip tone="muted">{v.vehicleType === 'COMMERCIAL' ? 'Commercial' : 'Passenger'}</Chip> : null}
                      {v.openJobs ? <Chip tone="brand">In the workshop</Chip> : null}
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--ejo-border)] pt-3 text-center text-xs">
                      <div><dt className="text-[var(--ejo-text-muted)]">Visits</dt><dd className="font-semibold text-[var(--ejo-text)]">{v.jobs}</dd></div>
                      <div><dt className="text-[var(--ejo-text-muted)]">Paid</dt><dd className="font-semibold text-[var(--ejo-text)]">{naira(v.netPaid)}</dd></div>
                      <div><dt className="text-[var(--ejo-text-muted)]">Mileage</dt><dd className="font-semibold text-[var(--ejo-text)]">{v.mileage !== null ? `${v.mileage.toLocaleString('en-NG')} km` : '—'}</dd></div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/workshop/vehicles/${v.id}/edit`} prefetch={false} className={ghost}>Vehicle page →</Link>
                      {can.openJobs ? <Link href={`/workshop/vehicle-service/book?vehicleId=${encodeURIComponent(v.id)}`} prefetch={false} className={ghost}><CrmIcon name="calendar" size={14} />Book service</Link> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {tab === 'jobs' ? (
          <Section icon="wrench" title={`Jobs & services (${data.jobs.length})`} subtitle="Job Cards and Vehicle Services, newest first. Billed = what the customer pays (warranty, goodwill and internal lines excluded).">
            <JobList jobs={data.jobs} />
          </Section>
        ) : null}

        {tab === 'payments' ? (
          <Section icon="receipt" title="Payments & refunds" subtitle={`Paid ${naira(money.paidIn)} · refunded ${naira(money.refunded)} · net ${naira(money.netPaid)}`}>
            {data.ledger.length === 0 ? <Empty icon="receipt" title="No payments or refunds yet." /> : (
              <ul className="divide-y divide-[var(--ejo-border)]">
                {data.ledger.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${p.kind === 'refund' ? 'bg-[var(--ejo-warning)]/12 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'}`}><CrmIcon name={p.kind === 'refund' ? 'refund' : 'wallet'} size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--ejo-text)]">{p.kind === 'refund' ? `Refund${p.reference ? ` ${p.reference}` : ''}` : 'Payment'} · <Link href={p.href} prefetch={false} className="text-[var(--ejo-primary)] hover:underline">{p.jobNumber}</Link></p>
                        <p className="truncate text-xs text-[var(--ejo-text-muted)]">{formatDateTimeCompact(p.at)} · {METHOD[p.method] ?? p.method}{p.by ? ` · recorded by ${p.by}` : ''}{p.note ? ` · ${p.note}` : ''}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${p.kind === 'refund' ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-text)]'}`}>{p.kind === 'refund' ? '−' : ''}{naira(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {tab === 'warranties' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Section icon="shield" title={`Warranties (${data.warranties.length})`}>
              {data.warranties.length === 0 ? <Empty icon="shield" title="No warranties registered." /> : (
                <ul className="divide-y divide-[var(--ejo-border)]">
                  {data.warranties.map((w) => {
                    const live = w.status === 'ACTIVE' && +new Date(w.endsAt) > Date.now();
                    return (
                      <li key={w.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {can.warranty ? <Link href={`/warranty/${w.id}`} prefetch={false} className="text-sm font-semibold text-[var(--ejo-primary)] hover:underline">{w.warrantyNumber}</Link> : <span className="text-sm font-semibold text-[var(--ejo-text)]">{w.warrantyNumber}</span>}
                          <Chip tone={live ? 'success' : w.status === 'VOID' ? 'error' : 'muted'}>{live ? 'Covering' : w.status === 'ACTIVE' ? 'Expired' : WARRANTY_STATUS_LABEL[w.status] ?? w.status}</Chip>
                        </div>
                        <p className="mt-0.5 break-words text-sm text-[var(--ejo-text)]">{w.subjectDescription}</p>
                        <p className="text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(w.startsAt)} – {formatDateOnly(w.endsAt)}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
            <Section icon="note" title={`Claims (${data.claims.length})`}>
              {data.claims.length === 0 ? <Empty icon="note" title="No warranty claims." /> : (
                <ul className="divide-y divide-[var(--ejo-border)]">
                  {data.claims.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        {can.warranty ? <Link href={`/warranty/claims/${w.id}`} prefetch={false} className="text-sm font-semibold text-[var(--ejo-primary)] hover:underline">{w.claimNumber}</Link> : <span className="text-sm font-semibold text-[var(--ejo-text)]">{w.claimNumber}</span>}
                        <p className="text-xs text-[var(--ejo-text-muted)]">On {w.warranty.warrantyNumber} · {formatDateOnly(w.createdAt)}</p>
                      </div>
                      <Chip tone={w.status === 'SETTLED' || w.status === 'ACCEPTED' ? 'success' : w.status === 'REJECTED' || w.status === 'CANCELLED' ? 'error' : 'warning'}>{CLAIM_STATUS_LABEL[w.status] ?? humanizeAction(w.status)}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'contacts' ? <ContactsTab data={data} /> : null}

        {tab === 'notes' ? (
          <Section icon="note" title="Notes" subtitle="Internal — never shown to the customer. Pinned notes appear on the overview.">
            {can.manage ? (
              <form action={customerNoteFormAction} className="mb-4 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="op" value="add" />
                <label className={labelCls} htmlFor="note-body">New note</label>
                <textarea id="note-body" name="body" required minLength={2} maxLength={2000} rows={3} placeholder="e.g. Prefers calls after 4 pm. Fleet manager approves estimates." className={field} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="pinned" value="yes" className="h-4 w-4" />Pin to the top</label>
                  <SubmitButton label="Add note" pendingLabel="Adding…" className={primary} />
                </div>
              </form>
            ) : null}
            {data.notes.length === 0 ? <Empty icon="note" title="No notes yet." /> : (
              <ul className="space-y-3">
                {data.notes.map((n) => (
                  <li key={n.id} className={`rounded-[var(--ejo-radius-md)] border p-3 ${n.pinned ? 'border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/[0.06]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)]'}`}>
                    <p className="whitespace-pre-line break-words text-sm text-[var(--ejo-text)]">{n.body}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-[var(--ejo-text-muted)]">{n.pinned ? <span className="mr-1 font-semibold text-[var(--ejo-warning)]">Pinned ·</span> : null}{n.author} · {formatDateTime(n.createdAt)}</p>
                      {can.manage ? (
                        <div className="flex gap-1.5">
                          <form action={customerNoteFormAction}><input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="noteId" value={n.id} /><input type="hidden" name="op" value={n.pinned ? 'unpin' : 'pin'} /><SubmitButton label={n.pinned ? 'Unpin' : 'Pin'} pendingLabel="…" className={ghost} /></form>
                          {n.mine ? <form action={customerNoteFormAction}><input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="noteId" value={n.id} /><input type="hidden" name="op" value="delete" /><SubmitButton label="Delete" pendingLabel="…" ariaLabel="Delete this note" className={`${ghost} hover:border-[var(--ejo-error)]/50 hover:text-[var(--ejo-error)]`} /></form> : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {tab === 'activity' ? (
          <Section icon="activity" title="Activity" subtitle="Everything changed by staff or by the customer, and the events of their jobs — newest first.">
            {activity.length === 0 ? <Empty icon="activity" title="No activity recorded yet." /> : (
              <ol className="relative space-y-4 border-l-2 border-[var(--ejo-border)] pl-5">
                {activity.map((e) => {
                  const lines = describeChanges(e.metadata?.changes);
                  const jobRef = e.entityType === 'Customer' ? null : data.jobs.find((j) => j.id === e.entityId);
                  const label = e.entityType === 'Customer' ? customerActionLabel(e.action) : CUSTOMER_ACTION_LABEL[e.action] ?? humanizeAction(e.action.replace(/^(job_card|vehicle_service|jobcard|service)\./, ''));
                  const reason = typeof e.metadata?.reason === 'string' ? e.metadata.reason : null;
                  const preview = typeof e.metadata?.preview === 'string' ? e.metadata.preview : typeof e.metadata?.removed === 'string' ? e.metadata.removed : null;
                  return (
                    <li key={e.id} className="relative">
                      <span className={`absolute -left-[27px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 bg-[var(--ejo-bg)] ${e.actor === 'customer' ? 'border-[var(--ejo-info)]' : 'border-[var(--ejo-primary)]'}`} aria-hidden="true" />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-[var(--ejo-text)]">{label}</p>
                        {jobRef ? <Link href={jobRef.href} prefetch={false} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{jobRef.number}</Link> : null}
                        <Chip tone={e.actor === 'customer' ? 'info' : e.actor === 'staff' ? 'brand' : 'muted'}>{e.actor === 'customer' ? 'Customer' : e.actor === 'staff' ? 'Staff' : 'System'}</Chip>
                      </div>
                      {lines.length ? <ul className="mt-1 space-y-0.5">{lines.map((l) => <li key={l} className="break-words text-xs text-[var(--ejo-text)]">{l}</li>)}</ul> : null}
                      {reason ? <p className="mt-0.5 break-words text-xs text-[var(--ejo-text)]">Reason: {reason}</p> : null}
                      {preview ? <p className="mt-0.5 break-words text-xs italic text-[var(--ejo-text-muted)]">“{preview}”</p> : null}
                      <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{e.who ? `${e.who} · ` : ''}{formatDateTime(e.at)}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

type Data = NonNullable<Awaited<ReturnType<typeof getCustomer360>>>;

function JobList({ jobs }: { jobs: Data['jobs'] }) {
  if (jobs.length === 0) return <Empty icon="wrench" title="No Job Cards or Vehicle Services yet." />;
  return (
    <ul className="divide-y divide-[var(--ejo-border)]">
      {jobs.map((j) => {
        const owed = !j.cancelled && j.finishedAt ? Math.max(0, j.customerBilled - j.paid) : 0;
        return (
          <li key={`${j.kind}-${j.id}`}>
            <Link href={j.href} prefetch={false} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ejo-radius-md)] px-2 py-3 transition hover:bg-[var(--ejo-bg)]">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><CrmIcon name={j.kind === 'JC' ? 'wrench' : 'calendar'} size={16} /></span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]">{j.number}<Chip tone={jobTone(j.kind, j.status)}>{JOB_STATUS_LABEL[j.kind][j.status] ?? humanizeAction(j.status)}</Chip></p>
                  <p className="truncate text-xs text-[var(--ejo-text-muted)]">{j.kind === 'JC' ? 'Job Card' : 'Vehicle Service'} · {j.vehicleLabel} · opened {formatDateOnly(j.openedAt)}{j.branchName ? ` · ${j.branchName}` : ''}</p>
                </div>
              </div>
              <div className="shrink-0 text-right text-xs">
                <p className="font-semibold tabular-nums text-[var(--ejo-text)]">{j.customerBilled ? naira(j.customerBilled) : '—'}</p>
                <p className={owed > 0 ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-text-muted)]'}>{owed > 0 ? `${naira(owed)} owed` : j.paid ? `${naira(j.paid)} paid` : j.cancelled ? 'Cancelled' : ''}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PortalCard({ data, base }: { data: Data; base: string }) {
  const { customer: c, portal, can } = data;
  return (
    <Section icon="key" title="Customer portal" subtitle="Sign-in to follow their vehicles online">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Access</dt><dd className={c.isActive ? 'font-medium text-[var(--ejo-success)]' : 'font-medium text-[var(--ejo-error)]'}>{c.isActive ? 'On' : 'Switched off'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Last sign-in</dt><dd className="text-right text-[var(--ejo-text)]">{portal.lastSignIn ? formatDateTimeCompact(portal.lastSignIn) : 'Never'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Set-password link</dt><dd className="text-right text-[var(--ejo-text)]">{portal.pendingLinkExpiresAt ? `Valid until ${formatDateTimeCompact(portal.pendingLinkExpiresAt)}` : 'None waiting'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-[var(--ejo-text-muted)]">Email updates</dt><dd className="text-[var(--ejo-text)]">{c.notifyByEmail ? 'Yes' : 'No'}</dd></div>
      </dl>
      {can.manage ? (
        <div className="mt-4 space-y-3 border-t border-[var(--ejo-border)] pt-4">
          {c.isActive ? (
            <form action={sendCustomerSetPasswordLinkFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="customerId" value={c.id} />
              <SubmitButton label="Send set-password link" pendingLabel="Sending…" className={`${primary} w-full justify-center`} />
              <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Valid 72 hours. Any earlier link stops working. No password is ever emailed.</p>
            </form>
          ) : null}
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">{c.isActive ? 'Switch portal access off…' : 'Switch portal access on…'}</summary>
            <form action={setCustomerPortalAccessFormAction} className="mt-2 flex flex-wrap items-center gap-1.5">
              <FormPendingOverlay />
              <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="active" value={c.isActive ? 'false' : 'true'} />
              <input name="reason" required={c.isActive} minLength={c.isActive ? 3 : 0} maxLength={200} aria-label={c.isActive ? 'Reason for switching off' : 'Note'} placeholder={c.isActive ? 'Reason (e.g. asked to close account)' : 'Note (optional)'} className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]" />
              <SubmitButton label={c.isActive ? 'Switch off and sign out' : 'Switch on'} pendingLabel="…" className={`rounded-[var(--ejo-radius-md)] border px-2 py-1.5 text-xs font-medium ${c.isActive ? 'border-[var(--ejo-error)]/40 text-[var(--ejo-error)]' : 'border-[var(--ejo-success)]/40 text-[var(--ejo-success)]'}`} />
            </form>
          </details>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]"><Link href={`${base}?tab=activity`} className="hover:text-[var(--ejo-primary)]">See their sign-ins and changes in Activity →</Link></p>
    </Section>
  );
}

function ContactsTab({ data }: { data: Data }) {
  const { customer: c, can } = data;
  const tel = (p: string) => `tel:${p.replace(/\s+/g, '')}`;
  const AddressFields = ({ a }: { a?: Data['addresses'][number] }) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <div><label className={labelCls}>Label</label><input name="label" maxLength={40} defaultValue={a?.label ?? ''} placeholder="e.g. Office, Home" className={field} /></div>
      <div><label className={labelCls}>Address <span className="text-[var(--ejo-error)]">*</span></label><input name="line1" required maxLength={160} defaultValue={a?.line1 ?? ''} className={field} /></div>
      <div><label className={labelCls}>Address line 2</label><input name="line2" maxLength={160} defaultValue={a?.line2 ?? ''} className={field} /></div>
      <div><label className={labelCls}>City</label><input name="city" maxLength={80} defaultValue={a?.city ?? ''} className={field} /></div>
      <div><label className={labelCls}>State</label><input name="state" maxLength={80} defaultValue={a?.state ?? ''} className={field} /></div>
      <div><label className={labelCls}>Country</label><input name="country" maxLength={80} defaultValue={a?.country ?? 'Nigeria'} className={field} /></div>
    </div>
  );
  const ContactFields = ({ p }: { p?: Data['contacts'][number] }) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <div><label className={labelCls}>Name <span className="text-[var(--ejo-error)]">*</span></label><input name="name" required maxLength={120} defaultValue={p?.name ?? ''} className={field} /></div>
      <div><label className={labelCls}>Role</label><input name="role" maxLength={60} defaultValue={p?.role ?? ''} placeholder="e.g. Fleet manager" className={field} /></div>
      <div><label className={labelCls}>Phone</label><input name="phone" type="tel" maxLength={20} pattern="\+?[0-9 ]{7,20}" title="Digits, spaces and a leading + (7–20 characters)" defaultValue={p?.phone ?? ''} className={field} /></div>
      <div><label className={labelCls}>Email</label><input name="email" type="email" maxLength={200} defaultValue={p?.email ?? ''} className={field} /></div>
    </div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <Section icon="phone" title="Primary contact" subtitle="Required for every customer — printed on Job Cards." action={can.manage ? <Link href={`/crm/customers/${c.id}?edit=1`} className={ghost}><CrmIcon name="edit" size={14} />Edit</Link> : undefined}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ejo-text-muted)]">Phone</dt><dd className="text-right">{c.phone ? <a href={tel(c.phone)} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">{c.phone}</a> : <span className="text-[var(--ejo-warning)]">Missing</span>}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ejo-text-muted)]">Second phone</dt><dd className="text-right">{c.altPhone ? <a href={tel(c.altPhone)} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">{c.altPhone}</a> : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ejo-text-muted)]">Email</dt><dd className="min-w-0 break-all text-right"><a href={`mailto:${c.email}`} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">{c.email}</a></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--ejo-text-muted)]">Primary address</dt><dd className="min-w-0 break-words text-right text-[var(--ejo-text)]">{c.address ?? <span className="text-[var(--ejo-warning)]">Missing</span>}</dd></div>
          </dl>
        </Section>
        <Section icon="map" title={`Other addresses (${data.addresses.length})`} subtitle="Delivery, billing, home or office — added by staff or by the customer.">
          {data.addresses.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No other addresses.</p> : (
            <ul className="space-y-3">
              {data.addresses.map((a) => (
                <li key={a.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm">
                  <p className="font-medium text-[var(--ejo-text)]">{a.label || 'Address'}</p>
                  <p className="break-words text-[var(--ejo-text)]">{[a.line1, a.line2, a.city, a.state, a.country].filter(Boolean).join(', ')}</p>
                  <p className="text-[11px] text-[var(--ejo-text-muted)]">Added {formatDateOnly(a.createdAt)}</p>
                  {can.manage ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-primary)]">Edit or remove</summary>
                      <form action={customerAddressFormAction} className="mt-2 space-y-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="addressId" value={a.id} /><input type="hidden" name="op" value="update" />
                        <AddressFields a={a} />
                        <SubmitButton label="Save address" pendingLabel="Saving…" className={primary} />
                      </form>
                      <form action={customerAddressFormAction} className="mt-2">
                        <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="addressId" value={a.id} /><input type="hidden" name="op" value="remove" />
                        <SubmitButton label="Remove this address" pendingLabel="Removing…" className={`${ghost} hover:border-[var(--ejo-error)]/50 hover:text-[var(--ejo-error)]`} />
                      </form>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {can.manage ? (
            <details className="mt-4 rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] p-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-primary)]">+ Add an address</summary>
              <form action={customerAddressFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="op" value="add" />
                <AddressFields />
                <SubmitButton label="Add address" pendingLabel="Adding…" className={primary} />
              </form>
            </details>
          ) : null}
        </Section>
      </div>
      <Section icon="users" title={`Contact people (${data.contacts.length})`} subtitle={c.customerType === 'ORGANIZATION' ? 'Who to call at this organisation — fleet manager, accounts, drivers.' : 'Someone else to reach for this customer (e.g. a driver or relative).'}>
        {data.contacts.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No contact people yet.</p> : (
          <ul className="space-y-3">
            {data.contacts.map((p) => (
              <li key={p.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm">
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} size={36} />
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--ejo-text)]">{p.name}{p.role ? <span className="font-normal text-[var(--ejo-text-muted)]"> · {p.role}</span> : null}</p>
                    <p className="break-all text-xs text-[var(--ejo-text-muted)]">{p.phone ? <a href={tel(p.phone)} className="hover:text-[var(--ejo-primary)]">{p.phone}</a> : null}{p.phone && p.email ? ' · ' : ''}{p.email ? <a href={`mailto:${p.email}`} className="hover:text-[var(--ejo-primary)]">{p.email}</a> : null}</p>
                  </div>
                </div>
                {can.manage ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-primary)]">Edit or remove</summary>
                    <form action={customerContactFormAction} className="mt-2 space-y-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="contactId" value={p.id} /><input type="hidden" name="op" value="update" />
                      <ContactFields p={p} />
                      <SubmitButton label="Save contact" pendingLabel="Saving…" className={primary} />
                    </form>
                    <form action={customerContactFormAction} className="mt-2">
                      <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="contactId" value={p.id} /><input type="hidden" name="op" value="remove" />
                      <SubmitButton label="Remove this contact" pendingLabel="Removing…" className={`${ghost} hover:border-[var(--ejo-error)]/50 hover:text-[var(--ejo-error)]`} />
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {can.manage ? (
          <details className="mt-4 rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-primary)]">+ Add a contact person</summary>
            <form action={customerContactFormAction} className="mt-3 space-y-2">
              <FormPendingOverlay />
              <input type="hidden" name="customerId" value={c.id} /><input type="hidden" name="op" value="add" />
              <ContactFields />
              <SubmitButton label="Add contact" pendingLabel="Adding…" className={primary} />
            </form>
          </details>
        ) : null}
      </Section>
    </div>
  );
}
