'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FloatingLayer } from '@/components/ui/FloatingLayer';
import { Icon } from '@/components/ui';
import { createExport, getExportProgress, type ExportProgress } from '@/lib/actions/exports';
import { hasSapLayout, type Layout } from '@/lib/exports/sap-layout';

type Params = Record<string, string | string[] | undefined>;

/** The menu: Excel and CSV with EJO's column names, and — for lists SAP also holds — the same with SAP's field names. */
function choices(kind: string): ['xlsx' | 'csv', Layout, string, string][] {
  return [
    ['xlsx', 'ejo', 'Excel (.xlsx)', 'Real dates and numbers, ready to sort and total'],
    ['csv', 'ejo', 'CSV', 'For other systems; opens in Excel too'],
    ...(hasSapLayout(kind) ? ([
      ['xlsx', 'sap', 'Excel, SAP field names', 'KUNNR, NAME1, MATNR… for the SAP team'],
      ['csv', 'sap', 'CSV, SAP field names', 'Line 1 is the header, as SAP load tools expect'],
    ] as ['xlsx' | 'csv', Layout, string, string][]) : []),
  ];
}

/**
 * Export this list — Excel or CSV, exactly as the list is filtered, searched
 * and sorted now, every matching record (not just this page). The download
 * starts at once; a long list comes in parts, each a complete file, and the
 * next part is one click away here or on the export's page.
 */
export function ExportButton({ kind, params = {}, label = 'Export', align = 'right' }: { kind: string; params?: Params; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; number: string; href: string; downloadHref: string } | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const partsSeen = useRef(0);

  const download = (href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const start = async (format: 'xlsx' | 'csv', layout: Layout = 'ejo') => {
    setOpen(false); setBusy(true); setError(null); setProgress(null);
    try {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) { const s = Array.isArray(v) ? v[0] : v; if (s) flat[k] = s; }
      if (layout === 'sap') flat.layout = 'sap'; else delete flat.layout;
      const r = await createExport({ kind, format, params: flat });
      if (!r.ok) { setError(r.error); setBusy(false); return; }
      partsSeen.current = 0;
      setJob(r);
      download(r.downloadHref);
    } catch {
      setError('The export could not start. Try again.');
      setBusy(false);
    }
  };

  // While a part downloads, ask how far it has got (every 2 seconds, for at most 10 minutes).
  useEffect(() => {
    if (!job || !busy) return;
    let stop = false;
    const t0 = Date.now();
    const tick = async () => {
      if (stop) return;
      const p = await getExportProgress(job.id).catch(() => null);
      if (stop) return;
      if (p) setProgress(p);
      const settled = p?.mine && !p.mine.downloading && p.mine.parts > partsSeen.current;
      if (settled || Date.now() - t0 > 600_000) { if (p?.mine) partsSeen.current = p.mine.parts; setBusy(false); return; }
      setTimeout(tick, 2000);
    };
    const first = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(first); };
  }, [job, busy]);

  const nextPart = () => { if (!job) return; setBusy(true); download(job.downloadHref); };
  const mine = progress?.mine;
  const rows = (n: number) => `${n.toLocaleString('en-NG')} ${n === 1 ? 'row' : 'rows'}`;

  return (
    <div className="relative inline-flex flex-col items-end gap-1 print:hidden">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="ejo-press inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] transition hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)] disabled:opacity-60"
      >
        <Icon name="download" size={16} />
        {busy ? 'Exporting…' : label}
        <Icon name="chevron-down" size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <FloatingLayer anchor={button} open={open} onClose={close} align={align} width="16rem" label={label}>
        <div>
          {choices(kind).map(([f, layout, title, hint], i) => (
            <button
              key={`${f}-${layout}`}
              type="button"
              role="menuitem"
              onClick={() => void start(f, layout)}
              className={`flex min-h-12 w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] ${i ? 'border-t border-[var(--ejo-border)]' : ''}`}
            >
              <Icon name={f === 'xlsx' ? 'grid' : 'file'} size={16} className={layout === 'sap' ? 'text-[var(--ejo-text-muted)]' : 'text-[var(--ejo-primary)]'} />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{hint}</span>
              </span>
            </button>
          ))}
          <p className="border-t border-[var(--ejo-border)] px-4 py-2.5 text-xs text-[var(--ejo-text-muted)]">Every record that matches the list’s filters and search, that you may see.</p>
        </div>
      </FloatingLayer>
      <div role="status" aria-live="polite" className="max-w-xs text-right text-xs">
        {error ? <span className="text-[var(--ejo-error)]">{error}</span> : null}
        {job && !error ? (
          <span className="text-[var(--ejo-text-muted)]">
            <Link href={job.href} className="font-medium text-[var(--ejo-primary)] hover:underline">{job.number}</Link>
            {' · '}
            {busy && !mine?.parts ? 'preparing your file…'
              : busy ? `downloading part ${(mine?.parts ?? 0) + 1}…`
              : mine?.finished ? `downloaded · ${rows(mine.rows)}`
              : mine?.more ? <>part {mine.parts} downloaded · {rows(mine.rows)} so far · <button type="button" onClick={nextPart} className="font-medium text-[var(--ejo-primary)] hover:underline">Download part {mine.parts + 1}</button></>
              : 'ready on its page'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
