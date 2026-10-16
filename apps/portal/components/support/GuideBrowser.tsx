'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import type { GuideCard } from '@/lib/help/features';

/**
 * The how-to guide for this person, searchable: type what you want to do and
 * the steps for your role appear, with the page and an "Ask Enyo" button.
 * The list comes from the server, already limited to what the person may open.
 */
export function GuideBrowser({ groups, compact = false }: { groups: { area: string; entries: GuideCard[] }[]; compact?: boolean }) {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const shown = useMemo(() => groups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => !words.length || words.every((w) => `${e.title} ${e.keywords.join(' ')} ${e.area}`.toLowerCase().includes(w))) }))
    .filter((g) => g.entries.length), [groups, words]);
  const total = shown.reduce((n, g) => n + g.entries.length, 0);
  const limit = compact && !words.length ? 6 : Infinity;
  let count = 0;
  return (
    <div>
      <label htmlFor="guide-search" className="sr-only">Search how to do something</label>
      <input id="guide-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How do I… (e.g. approve an estimate, request an exit pass)"
        className="min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-base text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/25 sm:text-sm" />
      <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]" aria-live="polite">{words.length ? `${total} ${total === 1 ? 'topic matches' : 'topics match'}` : `${total} ${total === 1 ? 'topic' : 'topics'} for your role`}</p>
      {words.length && !total ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">
          Nothing in the guide matches. <AskEnyoButton question={`How do I ${q.trim()}?`} label="Ask Enyo instead" />
        </div>
      ) : null}
      <div className="mt-3 space-y-5">
        {shown.map((g) => {
          if (count >= limit) return null;
          const entries = g.entries.slice(0, Math.max(0, limit - count));
          count += entries.length;
          return (
            <div key={g.area}>
              {!compact ? <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]">{g.area}</h3> : null}
              <ul className="space-y-2">
                {entries.map((e) => (
                  <li key={e.id}>
                    <details className="group rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] open:bg-[var(--ejo-bg)]">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--ejo-text)] [&::-webkit-details-marker]:hidden">
                        <span>{e.title}{!e.youCanDoThis ? <span className="ml-2 text-xs font-normal text-[var(--ejo-text-muted)]">({e.who ?? 'someone else'} does this)</span> : null}</span>
                        <span aria-hidden className="shrink-0 text-[var(--ejo-text-muted)] transition-transform group-open:rotate-180">▾</span>
                      </summary>
                      <div className="px-3 pb-3">
                        <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--ejo-text)]">{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link href={e.href} className="inline-flex min-h-9 items-center rounded-full bg-[var(--ejo-primary)] px-3 text-xs font-medium text-white hover:brightness-110">Open the page</Link>
                          <AskEnyoButton question={`Walk me through: ${e.title.toLowerCase()}`} label="Walk me through it" />
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
