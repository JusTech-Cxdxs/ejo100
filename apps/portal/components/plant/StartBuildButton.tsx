'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startBuild } from '@/lib/actions/plant-line';

/** Puts a released vehicle on the line: the live route becomes its stations. */
export function StartBuildButton({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error ? <span role="alert" className="text-xs text-[var(--ejo-error)]">{error}</span> : null}
      <button type="button" disabled={pending} onClick={() => start(async () => { setError(null); const r = await startBuild(vehicleId).catch(() => ({ ok: false as const, error: 'That did not work.' })); if (r.ok) router.push(`/plant/line/${vehicleId}`); else setError(r.error); })} className="ejo-press rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Start the build</button>
    </span>
  );
}
