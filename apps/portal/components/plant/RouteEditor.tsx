'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRoute } from '@/lib/actions/plant-line';
import { parseRouteText } from '@/lib/plant/line';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/** The route as text the plant manager edits: "# CODE | Station | STATION | minutes", then one check per line. Problems show as you type; nothing saves while one remains. */
export function RouteEditor({ familyKey, name, text }: { familyKey: string; name: string; text: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [routeName, setName] = useState(name);
  const [value, setValue] = useState(text);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parseRouteText(value), [value]);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="ejo-press rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-[var(--ejo-primary)]">Edit this route</button>;
  return (
    <div className="space-y-3" data-route-editor={familyKey}>
      <label className="block text-xs text-[var(--ejo-text-muted)]">Route name<input value={routeName} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${field} mt-1`} /></label>
      <label className="block text-xs text-[var(--ejo-text-muted)]">Stations and checks — a station line starts with #: <span className="font-mono">#&nbsp;C1 | Chassis frame dress | STATION | 45 min</span>; under it one check per line: <span className="font-mono">C1-03 | Cross-member bolts torque | N·m | 180 | 220</span> (a measurement) or <span className="font-mono">C1-04 | Brake lines routed</span> (pass/fail). Kinds: STATION, TEST, GATE (the route ends with a gate).
        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={18} spellCheck={false} className={`${field} mt-1 font-mono text-xs`} />
      </label>
      <p className="text-sm text-[var(--ejo-text)]"><b>{parsed.stations.length}</b> stations, <b>{parsed.stations.reduce((n, s) => n + s.checks.length, 0)}</b> checks, <b>{parsed.stations.reduce((n, s) => n + s.standardMinutes, 0)}</b> minutes standard.</p>
      {parsed.problems.length ? <ul className="list-disc pl-5 text-sm text-[var(--ejo-error)]" aria-label="Problems">{parsed.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul> : null}
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{msg.text}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || parsed.problems.length > 0} onClick={() => start(async () => { setMsg(null); const r = await saveRoute(familyKey, routeName, value).catch(() => ({ ok: false as const, error: 'That did not work. Try again.' })); if (r.ok) { setMsg({ ok: true, text: `Saved as version ${r.version}.` }); router.refresh(); } else setMsg({ ok: false, text: r.error }); })} className="ejo-press rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save as a new version</button>
        <button type="button" onClick={() => { setOpen(false); setValue(text); setName(name); setMsg(null); }} className="ejo-press rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-semibold text-[var(--ejo-text)]">Cancel</button>
      </div>
    </div>
  );
}
