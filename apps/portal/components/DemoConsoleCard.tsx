'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshDemoNow, removeDemoNow, setDemoOrganisation, type DemoConsoleState } from '@/lib/actions/demo-console';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const field = 'min-w-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const btn = 'ejo-press inline-flex min-h-11 items-center justify-center rounded-[var(--ejo-radius-md)] border px-4 text-sm font-semibold disabled:opacity-50';
type Result = { ok: true; summary: string } | { ok: false; error: string };

/**
 * The platform team's demo console: which organisation is the demo, what is
 * in it, and one button to load it again as of now or take the demo records
 * out. Typed words confirm each change; the server checks everything again.
 */
export function DemoConsoleCard({ state }: { state: DemoConsoleState }) {
  const router = useRouter();
  const [words, setWords] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const typed = (id: string) => (words[id] ?? '').trim().toLowerCase();
  const run = (id: string, fn: () => Promise<Result>) => start(async () => {
    setMsg(null);
    const r = await fn().catch(() => ({ ok: false as const, error: 'That did not finish. It may still be loading; refresh this page in a minute.' }));
    if (r.ok) { setMsg({ ok: true, text: r.summary }); setWords((w) => ({ ...w, [id]: '' })); router.refresh(); } else setMsg({ ok: false, text: r.error });
  });
  return (
    <section aria-labelledby="demo-console" className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4" data-testid="demo-console">
      <h2 id="demo-console" className="text-sm font-semibold text-[var(--ejo-text)]">Demo organisation</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
        Platform team only. The demo organisation has a sign-in for every role and six months of the workshop and six weeks of the plant, as of the moment they are loaded, with a new working day added each day{state.pulseOn ? '' : ' (switched off: DEMO_DAILY_ACTIVITY=off)'}. Loading replaces only the demo&rsquo;s own records. {state.passwordSet ? 'The demo sign-in password is set.' : 'DEMO_STAFF_PASSWORD is not set: the sign-ins are not made.'}
      </p>
      <ul className="mt-3 space-y-3">
        {state.orgs.map((o) => (
          <li key={o.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3" data-org={o.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-[var(--ejo-text)]">{o.name} <span className="text-xs text-[var(--ejo-text-muted)]">({o.slug})</span></p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.isDemo ? 'bg-[var(--ejo-primary)]/12 text-[var(--ejo-primary)]' : 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]'}`}>{o.isDemo ? 'Demo' : 'Real organisation'}</span>
            </div>
            {o.isDemo ? (
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {o.records ? `${o.records.toLocaleString('en-NG')} workshop demo records` : 'No workshop demo records'} · {o.plantVehicles} plant demo vehicles · {o.signIns} sign-ins ({o.people} active){o.loadedAt ? ` · loaded ${formatDateTimeCompact(o.loadedAt)}` : ''}{o.lastPulseDay ? ` · last working day ${o.lastPulseDay}` : ''}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-[var(--ejo-text-muted)]">
                Type {o.isDemo ? <><b>refresh the demo</b>, <b>remove the demo</b> or <b>{o.slug}</b> (to unmark)</> : <><b>{o.slug}</b> to make it the demo</>}
                <input value={words[o.id] ?? ''} onChange={(e) => setWords((w) => ({ ...w, [o.id]: e.target.value }))} className={`${field} mt-1 block w-64 max-w-full`} autoComplete="off" aria-label={`Confirm for ${o.name}`} />
              </label>
              {o.isDemo ? (
                <>
                  <button type="button" disabled={pending || typed(o.id) !== 'refresh the demo'} onClick={() => run(o.id, () => refreshDemoNow(o.id, words[o.id] ?? ''))} className={`${btn} border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white`}>{pending ? 'Working… (up to a few minutes)' : 'Load / refresh the demo now'}</button>
                  <button type="button" disabled={pending || typed(o.id) !== 'remove the demo'} onClick={() => run(o.id, () => removeDemoNow(o.id, words[o.id] ?? ''))} className={`${btn} border-[var(--ejo-error)] text-[var(--ejo-error)]`}>Remove the demo records</button>
                  <button type="button" disabled={pending || typed(o.id) !== o.slug.toLowerCase()} onClick={() => run(o.id, () => setDemoOrganisation(o.id, false, words[o.id] ?? ''))} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>Not a demo</button>
                </>
              ) : (
                <button type="button" disabled={pending || typed(o.id) !== o.slug.toLowerCase()} onClick={() => run(o.id, () => setDemoOrganisation(o.id, true, words[o.id] ?? ''))} className={`${btn} border-[var(--ejo-border)] text-[var(--ejo-text)]`}>Make it the demo</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${msg.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{msg.text}</p> : null}
    </section>
  );
}
