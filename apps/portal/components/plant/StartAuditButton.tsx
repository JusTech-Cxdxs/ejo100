'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startAudit } from '@/lib/actions/plant-line';

export function StartAuditButton({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error ? <span role="alert" className="text-xs text-[var(--ejo-error)]">{error}</span> : null}
      <button type="button" disabled={pending} onClick={() => start(async () => { setError(null); const r = await startAudit(vehicleId).catch(() => ({ ok: false as const, error: 'That did not work.' })); if (r.ok) router.push(`/plant/qa/${r.id}`); else setError(r.error); })} className="ejo-press rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Audit</button>
    </span>
  );
}
