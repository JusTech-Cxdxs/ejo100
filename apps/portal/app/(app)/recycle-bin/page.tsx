import { guardPage } from '@/lib/authz/server';
import { listRecycleBin, type RecycleBinRow } from '@/lib/actions/recycle-bin';
import { purgeExpiredFormAction, purgeSelectedFormAction, restoreFromRecycleBinFormAction } from '@/lib/actions/recycle-bin-form-handlers';
import { BIN_ENTITIES, BIN_KIND, binHref, isBinEntity } from '@/lib/recycle-bin/rules';
import { formatDateTime, formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { LoadingLink } from '@/components/LoadingLink';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { EmptyState, Icon, PageHeader, StatTile, StatusChip, type IconName } from '@/components/ui';

export const metadata = { title: 'Recycle bin' };

type SP = { q?: string; type?: string; state?: string; org?: string; cursor?: string; error?: string; restored?: string; entity?: string; rid?: string; was?: string; notes?: string; purged?: string };

const STATES: [string, string][] = [['in_bin', 'In the bin'], ['expired', 'Time ran out'], ['restored', 'Restored'], ['purged', 'Removed for good'], ['all', 'Everything']];

function StateChip({ r }: { r: RecycleBinRow }) {
  if (r.state === 'RESTORED') return <StatusChip tone="success" label="Restored" />;
  if (r.state === 'PURGED') return <StatusChip tone="neutral" label="Removed for good" />;
  if (r.state === 'EXPIRED') return <StatusChip tone="warning" label="Time ran out" />;
  return <StatusChip tone={r.daysLeft <= 3 ? 'warning' : 'brand'} label={r.daysLeft === 0 ? 'Last day' : `${pluralize(r.daysLeft, 'day')} left`} />;
}

function Row({ r, isPlatform, selectable, index }: { r: RecycleBinRow; isPlatform: boolean; selectable: boolean; index: number }) {
  const icon = BIN_KIND[r.entityType].icon as IconName;
  const open = r.state === 'IN_BIN';
  return (
    <li className="ejo-rise px-4 py-4 sm:px-5" style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }} data-testid="bin-row">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {selectable ? (
            <input type="checkbox" name="ids" value={r.id} form="purge-selected" aria-label={`Select ${r.reference}`} className="mt-3 h-4 w-4 shrink-0" />
          ) : null}
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-primary)]/15"><Icon name={icon} size={17} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{r.noun}</span>
              <StateChip r={r} />
              {r.organisation ? <span className="rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">{r.organisation}</span> : null}
            </div>
            <p className="mt-1 break-words text-sm font-semibold text-[var(--ejo-text)]">{r.label}</p>
            <p className="mt-1 break-words text-sm text-[var(--ejo-text)]"><span className="text-[var(--ejo-text-muted)]">Reason: </span>{r.reason}</p>
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              Deleted by {r.deletedBy} · {formatDateTime(r.deletedAt)}
              {open ? <> · can be restored until {formatDateTimeCompact(r.purgeAfter)}</> : null}
            </p>
            {r.state === 'RESTORED' && r.restoredAt ? (
              <p className="mt-1 text-xs text-[var(--ejo-success)]">
                Restored{r.restoredBy ? ` by ${r.restoredBy}` : ''} · {formatDateTime(r.restoredAt)}{r.restoredReference ? ` · now ${r.restoredReference}` : ''}
                {r.href ? <> · <LoadingLink href={r.href} className="font-medium underline">Open</LoadingLink></> : null}
              </p>
            ) : null}
            {r.state === 'PURGED' && r.purgedAt ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Removed for good by {r.purgedBy} · {formatDateTime(r.purgedAt)}</p> : null}
          </div>
        </div>
        {r.state === 'IN_BIN' || (isPlatform && r.state === 'EXPIRED') ? (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
            {r.state === 'IN_BIN' ? (
              <form action={restoreFromRecycleBinFormAction}>
                <FormPendingOverlay />
                <input type="hidden" name="itemId" value={r.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Restore ${r.reference}? It goes back exactly as it was, and appears in lists and search again.`}
                  label="Restore"
                  pendingLabel="Restoring…"
                  className="ejo-press w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110"
                />
              </form>
            ) : null}
            {isPlatform ? (
              <form action={purgeSelectedFormAction}>
                <input type="hidden" name="ids" value={r.id} />
                <ConfirmDeleteButton
                  confirmMessage={`Remove ${r.reference} for good? Its saved copy is deleted and it can never be restored.`}
                  label="Remove for good"
                  pendingLabel="Removing…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/60 px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
                />
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Administration → Recycle bin. Organisations see what they deleted by
 * mistake and restore it while the retention period lasts; the platform
 * team sees every organisation and removes expired items for good.
 */
export default async function RecycleBinPage({ searchParams }: { searchParams: Promise<SP> }) {
  await guardPage('admin.recycle_bin.manage', '/recycle-bin');
  const sp = await searchParams;
  const data = await listRecycleBin(sp);
  const state = STATES.some(([k]) => k === sp.state) ? sp.state! : 'in_bin';
  const keep = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, type: sp.type, state: sp.state, org: sp.org, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/recycle-bin${s ? `?${s}` : ''}`;
  };
  const selectable = data.isPlatform && state === 'expired' && data.rows.some((r) => r.state === 'EXPIRED');
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const restoredEntity = isBinEntity(sp.entity) ? sp.entity : null;

  return (
    <div className="ejo-page w-full max-w-6xl p-4 sm:p-8">
      <PageHeader
        icon="trash"
        title="Recycle bin"
        description={<>Records deleted because they were created by mistake. They are hidden everywhere and can be restored for {pluralize(data.days, 'day')}; after that they are removed for good. Anything with a payment, an approval, parts or a warranty can&apos;t be deleted: it is cancelled or closed through its own process instead.</>}
      />

      {sp.error ? <div role="alert" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-4 py-3 text-sm font-medium text-[var(--ejo-error)]">{sp.error}</div> : null}
      {sp.restored ? (
        <div role="status" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm text-[var(--ejo-success)]">
          <p className="flex flex-wrap items-center gap-x-2 font-medium">
            <Icon name="restore" size={16} />
            {sp.was ? `Restored as ${sp.restored}.` : `${sp.restored} restored.`}
            {restoredEntity && sp.rid ? <LoadingLink href={binHref(restoredEntity, sp.rid)} className="underline">Open {sp.restored}</LoadingLink> : null}
          </p>
          {sp.notes ? <ul className="mt-1 list-disc pl-6 text-[var(--ejo-text)]">{sp.notes.split('\n').filter(Boolean).map((n) => <li key={n}>{n}</li>)}</ul> : null}
        </div>
      ) : null}
      {sp.purged ? <div role="status" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm font-medium text-[var(--ejo-success)]">{sp.purged === '0' ? 'Nothing needed removing.' : `${pluralize(Number(sp.purged) || 0, 'item')} removed for good.`}</div> : null}

      <div className={`mb-6 grid gap-3 ${data.isPlatform ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'}`}>
        <StatTile icon="trash" label="In the bin" value={data.counts.inBin} href={keep({ state: undefined, cursor: undefined })} />
        <StatTile icon="clock" label="Kept for" value={pluralize(data.days, 'day')} hint="Then removed for good" />
        {data.isPlatform ? <StatTile icon="alert" label="Time ran out (waiting to be removed)" value={data.counts.expired} tone={data.counts.expired ? 'warning' : 'neutral'} emphasis={data.counts.expired > 0} href={keep({ state: 'expired', cursor: undefined })} className="col-span-2 lg:col-span-1" /> : null}
      </div>

      <form className="mb-4 grid gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="bin-q" className={label}>Search</label>
          <input id="bin-q" name="q" defaultValue={sp.q ?? ''} placeholder="Number, name, plate or reason" className={input} />
        </div>
        <div>
          <label htmlFor="bin-type" className={label}>What</label>
          <select id="bin-type" name="type" defaultValue={isBinEntity(sp.type) ? sp.type : ''} className={input}>
            <option value="">Everything</option>
            {BIN_ENTITIES.map((e) => <option key={e} value={e}>{BIN_KIND[e].plural}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bin-state" className={label}>Showing</label>
          <select id="bin-state" name="state" defaultValue={state} className={input}>
            {STATES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {data.isPlatform ? (
          <div>
            <label htmlFor="bin-org" className={label}>Organisation</label>
            <select id="bin-org" name="org" defaultValue={sp.org ?? ''} className={input}>
              <option value="">All organisations</option>
              {data.organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        ) : <div className="hidden lg:block" />}
        <div className="flex gap-2">
          <button type="submit" className="ejo-press inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white"><Icon name="search" size={15} />Show</button>
          <LoadingLink href="/recycle-bin" className="px-2 py-2 text-sm text-[var(--ejo-text-muted)] hover:underline">Clear</LoadingLink>
        </div>
      </form>

      {data.isPlatform && data.counts.expired > 0 ? (
        <section aria-label="Monthly maintenance" className="mb-4 flex flex-col gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-[var(--ejo-warning)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--ejo-text)]">Maintenance: {pluralize(data.counts.expired, 'item')} past the restore period</p>
              <p className="text-xs text-[var(--ejo-text-muted)]">The daily clean-up removes these automatically. Remove them now, or pick some under “Time ran out”.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectable ? (
              <form id="purge-selected" action={purgeSelectedFormAction}>
                <ConfirmDeleteButton confirmMessage="Remove the selected items for good? They can never be restored." label="Remove selected" pendingLabel="Removing…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/60 px-4 py-2 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
              </form>
            ) : null}
            <form action={purgeExpiredFormAction}>
              <FormPendingOverlay />
              <ConfirmDeleteButton confirmMessage={`Remove all ${pluralize(data.counts.expired, 'expired item')} for good? They can never be restored.`} label="Remove all expired" pendingLabel="Removing…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
            </form>
          </div>
        </section>
      ) : null}

      {data.rows.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <EmptyState icon="trash" title={state === 'in_bin' && !sp.q && !sp.type ? 'The Recycle bin is empty' : 'Nothing matches'}>
            {state === 'in_bin' ? 'When someone deletes a record created by mistake, it waits here so it can be restored.' : 'Try another filter.'}
          </EmptyState>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(data.rows.length, 'item')} on this page{sp.cursor ? ' (older)' : ''}</p>
          <ul aria-label="Recycle bin items" className="divide-y divide-[var(--ejo-border)] overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
            {data.rows.map((r, i) => <Row key={r.id} r={r} isPlatform={data.isPlatform} selectable={selectable && r.state === 'EXPIRED'} index={i} />)}
          </ul>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {sp.cursor ? <LoadingLink href={keep({ cursor: undefined })} className="text-[var(--ejo-primary)] hover:underline">← Back to newest</LoadingLink> : null}
        {data.nextCursor ? <LoadingLink href={keep({ cursor: data.nextCursor })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-1.5 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Older →</LoadingLink> : null}
      </div>
    </div>
  );
}
