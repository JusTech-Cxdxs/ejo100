import { guardPage } from '@/lib/authz/server';
import { getErrorLogPage, type ErrorLogRow } from '@/lib/actions/error-log';
import { ERROR_KINDS } from '@/lib/error-events-core';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { LoadingLink } from '@/components/LoadingLink';
import { CopyButton } from '@/components/CopyButton';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import { PageTitle } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';

type SP = { ref?: string; app?: string; kind?: string; route?: string; from?: string; to?: string; cursor?: string };

const KIND_CHIP: Record<string, string> = {
  connection: 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)]',
  database: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]',
  permission: 'bg-[var(--ejo-warning)]/15 text-[#b45309] dark:text-[var(--ejo-warning)]',
  'not-found': 'bg-[var(--ejo-text-muted)]/12 text-[var(--ejo-text-muted)]',
  browser: 'bg-[var(--ejo-text-muted)]/12 text-[var(--ejo-text-muted)]',
};
const chip = (k: string) => KIND_CHIP[k] ?? 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]';

function Row({ r, open }: { r: ErrorLogRow; open: boolean }) {
  return (
    <li className="px-4 py-3">
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold tracking-wide text-[var(--ejo-text)]" data-testid="error-ref">{r.ref}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip(r.kind)}`}>{r.kindLabel}</span>
              <span className="rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">{r.app === 'website' ? 'Website / customer portal' : 'Staff portal'}</span>
            </div>
            <p className="mt-1 line-clamp-2 break-words text-sm text-[var(--ejo-text)]">{r.message}</p>
            <p className="mt-0.5 break-all text-xs text-[var(--ejo-text-muted)]">{r.path ?? r.route ?? 'Unknown page'} · {r.who.label}</p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-[var(--ejo-text-muted)]">{formatDateTime(r.at)}</span>
        </summary>
        <div className="mt-3 grid gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-xs sm:grid-cols-2">
          <dl className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1"><dt className="text-[var(--ejo-text-muted)]">Reference:</dt><dd className="font-mono text-[var(--ejo-text)]">{r.ref}</dd><CopyButton value={r.ref} label="Copy reference" /></div>
            <div className="flex flex-wrap gap-2 pb-1">
              <AskEnyoButton send question={`Explain error ${r.ref} in plain words: what happened, the likely cause, whether any data could be affected, and what IT should check next.`} label="Explain with Enyo" />
              <AskEnyoButton send speak icon="speaker" question={`Explain error ${r.ref} aloud, briefly: what happened, the likely cause and what to check next.`} label="Explain aloud" />
            </div>
            <div><dt className="inline text-[var(--ejo-text-muted)]">When: </dt><dd className="inline text-[var(--ejo-text)]">{formatDateTime(r.at)} (Lagos time)</dd></div>
            <div><dt className="inline text-[var(--ejo-text-muted)]">Who: </dt><dd className="inline text-[var(--ejo-text)]">{r.who.href ? <LoadingLink href={r.who.href} className="text-[var(--ejo-primary)] hover:underline">{r.who.label}</LoadingLink> : r.who.label}{r.who.type === 'customer' ? ' (customer)' : ''}</dd></div>
            <div><dt className="inline text-[var(--ejo-text-muted)]">Where: </dt><dd className="inline break-all text-[var(--ejo-text)]">{[r.method, r.path].filter(Boolean).join(' ') || '—'}{r.route && r.route !== r.path ? ` (${r.route})` : ''}</dd></div>
            <div><dt className="inline text-[var(--ejo-text-muted)]">Error: </dt><dd className="inline break-words text-[var(--ejo-text)]">{r.name ? `${r.name}: ` : ''}{r.message}</dd></div>
          </dl>
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-[var(--ejo-text)]"><Icon name="info" size={14} className="text-[var(--ejo-primary)]" />What to do</p>
            <p className="mt-1 leading-relaxed text-[var(--ejo-text-muted)]">{r.todo}</p>
          </div>
          {r.stack ? (
            <details className="sm:col-span-2">
              <summary className="cursor-pointer text-[var(--ejo-primary)]">Technical detail for the development team</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--ejo-surface)] p-2 font-mono text-[11px] text-[var(--ejo-text-muted)]">{r.stack}</pre>
            </details>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/** Audit Logs → Error log: look up the reference a person quotes from an error screen. */
export default async function ErrorLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  await guardPage('audit.view', '/audit-logs/errors');
  const sp = await searchParams;
  const { rows, nextCursor, ref } = await getErrorLogPage(sp);
  const keep = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ref: sp.ref, app: sp.app, kind: sp.kind, route: sp.route, from: sp.from, to: sp.to, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/audit-logs/errors${s ? `?${s}` : ''}`;
  };
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs text-[var(--ejo-text-muted)]';
  return (
    <div className="ejo-page w-full p-4 sm:p-8">
      <LoadingLink href="/audit-logs" className="text-sm text-[var(--ejo-primary)] hover:underline">← Audit Logs</LoadingLink>
      <PageTitle icon="alert" className="mt-2">Error log</PageTitle>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
        Every error screen shows a reference number. Search for it here to see what happened, where, when and to whom. References are kept for 90 days. Messages are stored with passwords, tokens and email addresses removed.
      </p>
      <form className="mb-4 grid gap-2 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_auto] lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="ref" className={label}>Reference</label>
          <input id="ref" name="ref" defaultValue={sp.ref ?? ''} inputMode="numeric" autoComplete="off" placeholder="e.g. 3553129217" className={`${input} font-mono`} />
        </div>
        <div>
          <label htmlFor="app" className={label}>Where</label>
          <select id="app" name="app" defaultValue={sp.app ?? ''} className={input}>
            <option value="">Everywhere</option>
            <option value="portal">Staff portal</option>
            <option value="website">Website / customer portal</option>
          </select>
        </div>
        <div>
          <label htmlFor="kind" className={label}>Kind</label>
          <select id="kind" name="kind" defaultValue={sp.kind ?? ''} className={input}>
            <option value="">Any kind</option>
            {ERROR_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="route" className={label}>Page or route</label>
          <input id="route" name="route" defaultValue={sp.route ?? ''} placeholder="/workshop" className={input} />
        </div>
        <div><label htmlFor="from" className={label}>From</label><input id="from" type="date" name="from" defaultValue={sp.from ?? ''} className={input} /></div>
        <div><label htmlFor="to" className={label}>To</label><input id="to" type="date" name="to" defaultValue={sp.to ?? ''} className={input} /></div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-1.5 text-sm font-medium text-white">Search</button>
          <LoadingLink href="/audit-logs/errors" className="px-2 py-1.5 text-sm text-[var(--ejo-text-muted)] hover:underline">Clear</LoadingLink>
        </div>
      </form>

      {sp.ref && !ref ? <p role="alert" className="mb-3 text-sm text-[var(--ejo-error)]">That does not look like a reference. Enter the number exactly as shown on the error screen.</p> : null}
      {ref && rows.length === 0 ? (
        <div role="status" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm text-[var(--ejo-text-muted)]">
          No error with reference <span className="font-mono text-[var(--ejo-text)]">{ref}</span>. Check the digits with the person. References are kept for 90 days, and one shown less than a minute ago may still be on its way.
        </div>
      ) : rows.length === 0 ? (
        <div role="status" className="flex items-center gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm text-[var(--ejo-text-muted)]">
          <Icon name="check-circle" size={20} className="text-[var(--ejo-success)]" />No errors match.
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'error')} on this page{sp.cursor ? ' (older)' : ''}</p>
          <ul className="divide-y divide-[var(--ejo-border)] overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
            {rows.map((r) => <Row key={r.id} r={r} open={Boolean(ref)} />)}
          </ul>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {sp.cursor ? <LoadingLink href={keep({ cursor: undefined })} className="text-[var(--ejo-primary)] hover:underline">← Back to newest</LoadingLink> : null}
        {nextCursor ? <LoadingLink href={keep({ cursor: nextCursor })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-1.5 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Older →</LoadingLink> : null}
      </div>

      <details className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">What each kind of error means</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {ERROR_KINDS.map((k) => <li key={k.key}><span className="font-medium text-[var(--ejo-text)]">{k.label}.</span> <span className="text-[var(--ejo-text-muted)]">{k.todo}</span></li>)}
        </ul>
      </details>
    </div>
  );
}
