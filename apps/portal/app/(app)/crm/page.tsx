import Link from 'next/link';
import { getCrmHub, type CrmHubParams } from '@/lib/actions/crm';
import { allows, guardPage } from '@/lib/authz/server';
import { profileGaps, naira, nairaShort } from '@/lib/crm';
import { formatDateOnly } from '@/lib/utils/format-date';
import { Avatar } from '@/components/Avatar';
import { CustomerLink } from '@/components/CustomerLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CrmIcon } from '@/components/crm/CrmIcon';
import { Chip, Empty, Kpi, NoticeBox, Section, type Notice } from '@/components/crm/ui';
import { RegisterCustomerForm } from '@/components/crm/RegisterCustomerForm';

export const metadata = { title: 'Customers' };

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

type SP = CrmHubParams & { status?: string; error?: string; register?: string };

const NOTICES: Record<string, Notice> = {
  customer_existing: { kind: 'success', title: 'That email already had a customer record', text: 'It was reused — no duplicate was created.' },
  customer_created_emailed: { kind: 'success', title: 'Customer registered', text: 'A welcome email with a link to set their password is on its way.' },
  customer_created_no_email: { kind: 'warning', title: 'Customer registered, but the welcome email was not sent', text: 'Send the set-password link again from their customer page once email is working.' },
};

export default async function CrmHubPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Guarded here as well as in the layout: they render together, and the page's own reads must never run for someone refused.
  await guardPage('crm.view', '/crm');
  const sp = await searchParams;
  const [hub, canBroadcast] = await Promise.all([getCrmHub(sp), allows('notifications.broadcast.send')]);
  const k = hub.kpis;
  const filtered = Boolean(sp.q || sp.type || sp.tag || sp.status || sp.open || sp.portal || sp.gaps);
  const notice: Notice | null = sp.error ? { kind: 'error', title: 'That didn’t work', text: sp.error } : sp.status ? NOTICES[sp.status] ?? null : null;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const key of ['q', 'type', 'tag', 'status', 'open', 'portal', 'gaps', 'sort', 'page'] as const) { const v = key in patch ? patch[key] : sp[key]; if (v && !(key === 'status' && !['active', 'off'].includes(v))) p.set(key, v); }
    const s = p.toString();
    return `/crm${s ? `?${s}` : ''}`;
  };

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      {/* Hero */}
      <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-5 sm:p-8">
        <div className="ejo-orb pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
        <div className="ejo-orb pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" style={{ animationDelay: '-4s' }} aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--ejo-surface)] text-[var(--ejo-primary)] shadow-sm"><CrmIcon name="users" size={24} /></span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-[var(--ejo-text)] sm:text-3xl">Customers</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
                Every customer with their vehicles, visits, spend, warranties, contacts and change history.
                {hub.scope.branchOnly ? <> Visits and money show <span className="font-medium text-[var(--ejo-text)]">{hub.scope.branchName}</span> only.</> : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canBroadcast ? (
              <Link href="/notifications/broadcasts/new?for=customers" className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50">
                <CrmIcon name="broadcast" size={16} /> Message customers
              </Link>
            ) : null}
            {hub.canRegister ? (
              <a href="/crm?register=1#register" className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95">
                <CrmIcon name="plus" size={16} /> Register customer
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {notice ? <NoticeBox n={notice} /> : null}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon="users" label="Customers" value={k.total} hint={`${k.portalOff} with portal access off`} delay={0} />
        <Kpi icon="activity" label="Active · 90 days" value={k.active90} hint="Visited in the last 90 days" href={qs({ sort: 'last_visit', page: undefined })} delay={40} />
        <Kpi icon="spark" label="New this month" value={k.newThisMonth} hint="Registered since the 1st" href={qs({ sort: 'recent', page: undefined })} delay={80} />
        <Kpi icon="key" label="Portal access" value={k.withPortal} hint={`${k.signedIn} have signed in`} href={qs({ portal: 'signed_in', page: undefined })} delay={120} />
        <Kpi icon="alert" label="Profile gaps" value={k.profileGaps} tone={k.profileGaps ? 'warning' : undefined} hint="Missing primary address or phone" href={qs({ gaps: 'yes', page: undefined })} delay={160} />
        <Kpi icon="wallet" label="Spend this year" value={k.spendThisYear} format="naira" hint="Paid, net of refunds" href={qs({ sort: 'spend', page: undefined })} delay={200} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {hub.canRegister ? (
            <details id="register" open={sp.register === '1' || undefined} className="group ejo-rise scroll-mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><CrmIcon name="plus" size={18} /></span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--ejo-text)]">Register a customer</span>
                    <span className="block text-xs text-[var(--ejo-text-muted)]">Primary address and phone required · welcome email with a set-password link</span>
                  </span>
                </span>
                <span className="text-[var(--ejo-text-muted)] transition-transform group-open:rotate-45" aria-hidden="true">＋</span>
              </summary>
              <RegisterCustomerForm />
            </details>
          ) : null}

          {/* Find customers */}
          <form role="search" className="ejo-rise grid gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="crm-q">Search</label>
              <LiveSearchInput id="crm-q" name="q" defaultValue={sp.q ?? ''} placeholder="Name, email, phone or plate…" className={field} />
            </div>
            <div><label className={labelCls} htmlFor="crm-type">Type</label>
              <select id="crm-type" name="type" defaultValue={sp.type ?? ''} className={field}><option value="">All types</option><option value="INDIVIDUAL">Individuals</option><option value="ORGANIZATION">Organisations</option></select>
            </div>
            <div><label className={labelCls} htmlFor="crm-sort">Sort by</label>
              <select id="crm-sort" name="sort" defaultValue={sp.sort ?? 'recent'} className={field}><option value="recent">Newest first</option><option value="name">Name (A–Z)</option><option value="spend">Highest spend</option><option value="last_visit">Most recent visit</option></select>
            </div>
            <div><label className={labelCls} htmlFor="crm-status">Portal access</label>
              <select id="crm-status" name="status" defaultValue={sp.status && ['active', 'off'].includes(sp.status) ? sp.status : ''} className={field}><option value="">On or off</option><option value="active">On (active)</option><option value="off">Switched off</option></select>
            </div>
            <div><label className={labelCls} htmlFor="crm-portal">Signed in</label>
              <select id="crm-portal" name="portal" defaultValue={sp.portal ?? ''} className={field}><option value="">Anyone</option><option value="signed_in">Has signed in</option><option value="never">Never signed in</option></select>
            </div>
            <div><label className={labelCls} htmlFor="crm-open">Open job</label>
              <select id="crm-open" name="open" defaultValue={sp.open ?? ''} className={field}><option value="">Any</option><option value="yes">In the workshop now</option><option value="no">Nothing open</option></select>
            </div>
            <div><label className={labelCls} htmlFor="crm-gaps">Profile</label>
              <select id="crm-gaps" name="gaps" defaultValue={sp.gaps ?? ''} className={field}><option value="">Any</option><option value="yes">Missing address or phone</option></select>
            </div>
            {hub.tags.length ? (
              <div><label className={labelCls} htmlFor="crm-tag">Tag</label>
                <select id="crm-tag" name="tag" defaultValue={sp.tag ?? ''} className={field}><option value="">Any tag</option>{hub.tags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Apply</button>
              {filtered ? <Link href="/crm" className="px-1 py-2 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Clear</Link> : null}
            </div>
          </form>

          <p className="text-sm text-[var(--ejo-text-muted)]">{hub.matching} {hub.matching === 1 ? 'customer' : 'customers'}{filtered ? ' match' : ''}{hub.pages > 1 ? ` · page ${hub.page} of ${hub.pages}` : ''}</p>

          {hub.rows.length === 0 ? (
            <Empty icon="search" title={filtered ? 'No customer matches those filters.' : 'No customers yet.'} text={filtered ? 'Try a different search, or clear the filters.' : hub.canRegister ? 'Register the first one above.' : 'Front desk registers customers.'} />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Customers">
              {hub.rows.map((c, i) => {
                const gaps = profileGaps(c);
                return (
                  <li key={c.id} className="ejo-rise flex min-w-0 flex-col rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--ejo-primary)]/40 hover:shadow-md motion-reduce:transform-none" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                    <div className="flex items-start gap-3">
                      <Avatar name={c.fullName} size={44} active={c.isActive} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--ejo-text)]"><CustomerLink id={c.id} name={c.fullName} canView /></p>
                        <p className="truncate text-xs text-[var(--ejo-text-muted)]">{c.phone ?? 'No phone'}{c.email ? ` · ${c.email}` : ''}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Chip tone="muted">{c.customerType === 'ORGANIZATION' ? 'Organisation' : 'Individual'}</Chip>
                          {!c.isActive ? <Chip tone="error">Portal off</Chip> : c.lastSignIn ? <Chip tone="success">Signed in {formatDateOnly(c.lastSignIn)}</Chip> : <Chip tone="muted">Never signed in</Chip>}
                          {c.openJobs ? <Chip tone="brand">{c.openJobs} open</Chip> : null}
                          {gaps.length ? <Chip tone="warning">No {gaps.join(' or ')}</Chip> : null}
                          {c.tags.map((t) => <Link key={t} href={qs({ tag: t, page: undefined })} prefetch={false}><Chip tone="info"><CrmIcon name="tag" size={11} />{t}</Chip></Link>)}
                        </div>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--ejo-border)] pt-3 text-center">
                      <div><dt className="text-[10px] uppercase tracking-wide text-[var(--ejo-text-muted)]">Vehicles</dt><dd className="text-sm font-semibold text-[var(--ejo-text)]">{c.vehicles}</dd></div>
                      <div><dt className="text-[10px] uppercase tracking-wide text-[var(--ejo-text-muted)]">Lifetime spend</dt><dd className="text-sm font-semibold text-[var(--ejo-text)]" title={naira(c.netPaid)}>{nairaShort(c.netPaid)}</dd></div>
                      <div><dt className="text-[10px] uppercase tracking-wide text-[var(--ejo-text-muted)]">Last visit</dt><dd className="text-sm font-semibold text-[var(--ejo-text)]">{c.lastVisit ? formatDateOnly(c.lastVisit) : '—'}</dd></div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}

          {hub.pages > 1 ? (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-2">
              {hub.page > 1 ? <Link href={qs({ page: String(hub.page - 1) })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">← Previous</Link> : null}
              <span className="px-2 text-sm text-[var(--ejo-text-muted)]">Page {hub.page} of {hub.pages}</span>
              {hub.page < hub.pages ? <Link href={qs({ page: String(hub.page + 1) })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Next →</Link> : null}
            </nav>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          <Section icon="star" title="Top spenders this year" subtitle="Paid, net of refunds">
            {hub.topSpenders.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No payments recorded this year yet.</p> : (
              <ol className="space-y-2">
                {hub.topSpenders.map((t, i) => {
                  const pct = hub.topSpenders[0]!.netYear ? Math.max(6, Math.round((t.netYear / hub.topSpenders[0]!.netYear) * 100)) : 0;
                  return (
                    <li key={t.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate"><span className="mr-1.5 text-xs text-[var(--ejo-text-muted)]">{i + 1}.</span><CustomerLink id={t.id} name={t.fullName} canView className="text-[var(--ejo-text)]" /></span>
                        <span className="shrink-0 font-semibold tabular-nums text-[var(--ejo-text)]">{naira(t.netYear)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--ejo-bg)]"><div className="h-1.5 rounded-full bg-[var(--ejo-primary)]" style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
          <Section icon="activity" title="At a glance">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-2"><Link href={qs({ open: 'yes', page: undefined })} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">In the workshop now</Link><span className="font-semibold tabular-nums">{k.withOpenJobs}</span></li>
              <li className="flex justify-between gap-2"><Link href={qs({ portal: 'signed_in', page: undefined })} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">Using the customer portal</Link><span className="font-semibold tabular-nums">{k.signedIn}</span></li>
              <li className="flex justify-between gap-2"><Link href={qs({ portal: 'never', page: undefined })} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">Never signed in</Link><span className="font-semibold tabular-nums">{k.neverSignedIn}</span></li>
              <li className="flex justify-between gap-2"><Link href={qs({ status: 'off', page: undefined })} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">Portal access off</Link><span className="font-semibold tabular-nums">{k.portalOff}</span></li>
              <li className="flex justify-between gap-2"><Link href={qs({ gaps: 'yes', page: undefined })} className="text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]">Profile gaps to fix</Link><span className={`font-semibold tabular-nums ${k.profileGaps ? 'text-[var(--ejo-warning)]' : ''}`}>{k.profileGaps}</span></li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
