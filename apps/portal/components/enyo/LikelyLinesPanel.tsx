'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { LoadingLink } from '@/components/LoadingLink';
import { dismissLikelyLines } from '@/lib/actions/enyo-predict';
import { requestPrefill } from '@/lib/enyo/predict/prefill';

type Range = { median: number; p25: number; p75: number };

export type PanelLine = {
  key: string;
  type: string;
  label: string;
  categoryName: string | null;
  support: number;
  of: number;
  confidence: number;
  quantity: number;
  unitPrice: Range | null;
  amount: Range | null;
  partTypeId: string | null;
  store: { priceMin: number | null; priceMax: number | null; available: number; parts: number } | null;
  alreadyOnEstimate: boolean;
};

export type PanelEvidence = { number: string; href: string; similarity: number; vehicle: string; complaint: string; shared: string[] };

const TYPE_LABEL: Record<string, string> = {
  STORE_PART: 'Store Part', EXTERNAL_PART: 'External Part', EXTERNAL_JOB: 'External Job', INTERNAL_JOB: 'Internal Job', LABOUR: 'Labour', SUNDRY: 'Sundry',
};

const naira = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

/** Today's Store figures, or what similar jobs charged, in one plain line. */
function priceNote(l: PanelLine): string {
  if (l.type === 'STORE_PART') {
    if (!l.partTypeId) return 'Not in this branch’s Store catalogue';
    if (!l.store || l.store.parts === 0) return 'No fitting part in the Store yet';
    const { priceMin, priceMax, available } = l.store;
    const price = priceMin === null ? 'No selling price set yet' : priceMin === priceMax ? `${naira(priceMin)} each today` : `${naira(priceMin)}–${naira(priceMax ?? priceMin)} each today`;
    return `${price} · ${available > 0 ? `${plural(available, 'unit', 'units')} in stock` : 'none in stock'}`;
  }
  if (l.type === 'EXTERNAL_PART') return 'Priced when bought outside';
  if (!l.amount) return 'No price history';
  const { median, p25, p75 } = l.amount;
  return p25 === p75 ? `Usually ${naira(median)}` : `Usually ${naira(median)} (most between ${naira(p25)} and ${naira(p75)})`;
}

/**
 * The suggestions themselves. "Add" fills in the add-line form further down
 * the page (it does not save anything); "Hide suggestions" records that this
 * estimate does not need them.
 */
export function LikelyLinesPanel({
  predictionId,
  displayName,
  ok,
  reason,
  lines,
  evidence,
  hiddenEvidence,
}: {
  predictionId: string;
  displayName: string;
  ok: boolean;
  reason: string | null;
  lines: PanelLine[];
  evidence: PanelEvidence[];
  hiddenEvidence: number;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  if (hidden) return null;

  function dismiss() {
    setError('');
    startTransition(async () => {
      try {
        await dismissLikelyLines(predictionId);
        setHidden(true);
        router.refresh();
      } catch {
        setError('The suggestions could not be hidden just now. Please try again.');
      }
    });
  }

  const used = ok ? (lines[0]?.of ?? evidence.length + hiddenEvidence) : evidence.length + hiddenEvidence;

  return (
    <section
      aria-labelledby={`likely-lines-${predictionId}`}
      className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/25 bg-[var(--ejo-primary)]/[0.04] p-4"
      data-testid="likely-lines"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]" aria-hidden="true">
            <Icon name="sparkles" size={15} />
          </span>
          <div className="min-w-0">
            <h3 id={`likely-lines-${predictionId}`} className="text-sm font-semibold text-[var(--ejo-text)]">Likely lines from similar jobs</h3>
            <p className="text-xs text-[var(--ejo-text-muted)]">
              {ok
                ? `${displayName} looked at ${plural(used, 'similar finished job', 'similar finished jobs')}. Nothing is added until you press Add, check the form below and save it.`
                : (reason ?? 'No suggestions for this estimate yet.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          className="min-h-11 rounded-[var(--ejo-radius-md)] px-3 text-xs font-medium text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ejo-primary)] disabled:opacity-60 sm:min-h-8"
        >
          {pending ? 'Hiding…' : 'Hide suggestions'}
        </button>
      </div>

      {error ? <p role="alert" className="mt-2 text-xs text-[var(--ejo-error)]">{error}</p> : null}

      {ok && lines.length ? (
        <ul className="mt-3 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          {lines.map((l) => {
            const pct = Math.round(l.confidence * 100);
            const canAdd = !l.alreadyOnEstimate && (l.type !== 'STORE_PART' || Boolean(l.partTypeId));
            return (
              <li key={l.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[var(--ejo-text)]">
                    <span className="break-words">{l.label}</span>
                    <span className="rounded-full bg-[var(--ejo-text-muted)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--ejo-text-muted)]">{TYPE_LABEL[l.type] ?? l.type}</span>
                    <span className="text-xs font-normal text-[var(--ejo-text-muted)]">× {l.quantity.toLocaleString('en-NG')}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">
                    <span className="font-medium text-[var(--ejo-text)]">{l.support} of {l.of} similar jobs</span> · {pct}% confidence · {priceNote(l)}
                  </p>
                  <div className="mt-1.5 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-[var(--ejo-border)]" aria-hidden="true">
                    <div className="h-full rounded-full bg-[var(--ejo-primary)]" style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                </div>
                {l.alreadyOnEstimate ? (
                  <span className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[var(--ejo-success)] sm:min-h-8"><Icon name="check" size={14} />Already on the estimate</span>
                ) : canAdd ? (
                  <button
                    type="button"
                    aria-label={`Add ${l.label} to the form`}
                    onClick={() =>
                      requestPrefill({
                        type: l.type,
                        partTypeId: l.partTypeId,
                        partTypeLabel: l.type === 'STORE_PART' ? l.label : null,
                        description: l.type === 'STORE_PART' ? null : l.label,
                        quantity: l.quantity,
                        unitPrice: l.unitPrice?.median ?? null,
                      })
                    }
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/40 px-4 text-sm font-medium text-[var(--ejo-primary)] transition-colors hover:bg-[var(--ejo-primary)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ejo-primary)] sm:min-h-9"
                  >
                    <Icon name="plus" size={14} />Add
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {evidence.length || hiddenEvidence ? (
        <details className="group mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-[var(--ejo-radius-md)] text-xs font-medium text-[var(--ejo-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ejo-primary)] sm:min-h-8">
            <span className="transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true"><Icon name="chevron-right" size={14} /></span>
            Why?
          </summary>
          <div className="mt-2 text-xs text-[var(--ejo-text-muted)]">
            <p>These finished jobs had complaints most like this one (the closest first). Their approved estimates are what the suggestions come from.</p>
            {evidence.length ? (
              <ul className="mt-2 space-y-2">
                {evidence.map((e) => (
                  <li key={e.href} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-2.5">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <LoadingLink href={e.href} className="font-semibold text-[var(--ejo-primary)] underline-offset-2 hover:underline">{e.number}</LoadingLink>
                      <span>{e.vehicle}</span>
                      <span>· {Math.round(e.similarity * 100)}% alike</span>
                    </p>
                    <p className="mt-0.5 break-words text-[var(--ejo-text)]">{e.complaint}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {hiddenEvidence ? (
              <p className="mt-2">{`${plural(hiddenEvidence, 'similar job is', 'similar jobs are')} from a branch you cannot open, so ${hiddenEvidence === 1 ? 'it is' : 'they are'} not listed.`}</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
