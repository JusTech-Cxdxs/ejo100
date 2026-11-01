'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { getExportProgress, type ExportProgress } from '@/lib/actions/exports';

/**
 * An export's download, on its page: the file (or its next part) for you,
 * how far you have got, and when the link stops working.
 */
export function ExportDownloadPanel({ id, initial }: { id: string; initial: ExportProgress }) {
  const [p, setP] = useState(initial);
  const [waiting, setWaiting] = useState(Boolean(initial.mine?.downloading));
  const [seen, setSeen] = useState(initial.mine?.parts ?? 0);

  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const t0 = Date.now();
    const tick = async () => {
      const next = await getExportProgress(id).catch(() => null);
      if (stop) return;
      if (next) setP(next);
      if ((next?.mine && !next.mine.downloading && next.mine.parts > seen) || Date.now() - t0 > 600_000) { setSeen(next?.mine?.parts ?? seen); setWaiting(false); return; }
      setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(t); };
  }, [waiting, id, seen]);

  const mine = p.mine;
  const rows = (n: number) => `${n.toLocaleString('en-NG')} ${n === 1 ? 'row' : 'rows'}`;
  const href = `/data-exchange/exports/${id}/download`;
  const action = mine?.more ? `Download part ${mine.parts + 1}` : `Download (${p.format === 'csv' ? 'CSV' : 'Excel'})`;

  let state: React.ReactNode;
  if (p.expired) state = 'This link has expired: exports work for 24 hours. Export the list again for a fresh file.';
  else if (mine?.finished) state = `You have downloaded this export: ${rows(mine.rows)}${mine.parts > 1 ? ` in ${mine.parts} parts` : ''}. Each link works once per person; export the list again for a fresh file.`;
  else if (waiting) state = mine?.parts ? `Downloading part ${mine.parts + 1}…` : 'Preparing your file…';
  else if (mine?.more) state = `Part ${mine.parts} downloaded · ${rows(mine.rows)} so far. The list is longer than one download: part ${mine.parts + 1} carries on exactly where it stopped.`;
  else state = 'Built now, for you: every matching record you may see.';

  const canDownload = !p.expired && !mine?.finished && !waiting;
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm text-[var(--ejo-text)]">{state}</p>
      {canDownload ? (
        <a
          href={href}
          download
          onClick={() => setWaiting(true)}
          className="ejo-press inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
        >
          <Icon name="download" size={16} />
          {action}
        </a>
      ) : null}
    </div>
  );
}
