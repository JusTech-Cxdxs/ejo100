'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { findPlantVehicle, startPdi } from '@/lib/actions/plant';
import { PLANT_MODELS } from '@/lib/plant/pdi';
import { normaliseVin, vinFromScan } from '@/lib/vin';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * Start a PDI: scan the vehicle's label (QR or barcode) or type the VIN.
 * A vehicle already in the plant opens its PDI at once; a new one is
 * registered here first — model, engine number, and the numbers SAP knows
 * it by (all but the model optional).
 */
export function StartPdi({ branches, defaultBranchId, canRegister }: { branches: { id: string; name: string; sapPlant: string | null }[]; defaultBranchId: string | null; canRegister: boolean }) {
  const router = useRouter();
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const go = async (extra: Record<string, string> = {}) => {
    setBusy(true); setError(null);
    try {
      const r = await startPdi({ vin, ...extra });
      if (r.ok) { router.push(`/plant/pdi/${r.id}`); return; }
      setError(r.error);
    } catch { setError('That did not work. Try again.'); }
    setBusy(false);
  };

  const onVin = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = vinFromScan(vin);
    if (!v) { setError('Scan the label or type the VIN (letters and digits).'); return; }
    setVin(v); setBusy(true); setError(null);
    try {
      const found = await findPlantVehicle(v);
      if (found?.openPdi) { router.push(`/plant/pdi/${found.openPdi.id}`); return; }
      if (found) { setBusy(false); await go(); return; }
      setBusy(false);
      if (!canRegister) { setError('This VIN is not in the plant yet. Ask the PDI supervisor or plant manager to register it.'); return; }
      setRegistering(true);
    } catch { setBusy(false); setError('That did not work. Try again.'); }
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(form.current!);
    const extra: Record<string, string> = {};
    fd.forEach((v, k) => { if (typeof v === 'string' && v.trim()) extra[k] = v.trim(); });
    await go(extra);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onVin} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="pdi-vin" className={label}>Scan the label or type the VIN</label>
          <input id="pdi-vin" autoFocus autoComplete="off" spellCheck={false} value={vin} onChange={(e) => { setVin(e.target.value); setRegistering(false); setError(null); }} placeholder="e.g. JAANLR85EL7100001" className={`${input} font-mono uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal`} />
        </div>
        <button type="submit" disabled={busy || !vin.trim()} className="ejo-press inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Icon name="clipboard" size={16} />{busy ? 'Opening…' : 'Start the PDI'}</button>
      </form>
      {error ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{error}</p> : null}
      {registering ? (
        <form ref={form} onSubmit={onRegister} className="space-y-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4" aria-label="Register the vehicle">
          <p className="text-sm text-[var(--ejo-text)]"><span className="font-mono font-semibold">{normaliseVin(vin)}</span> is new to the plant. Register it, then its PDI starts.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="pdi-model" className={label}>Model *</label>
              <select id="pdi-model" name="modelCode" required defaultValue="" className={input}><option value="" disabled>Choose…</option>{PLANT_MODELS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select></div>
            <div><label htmlFor="pdi-variant" className={label}>Variant (as on the build papers)</label><input id="pdi-variant" name="modelName" placeholder="e.g. NQR 75 cab chassis" className={input} /></div>
            <div><label htmlFor="pdi-engine" className={label}>Engine number</label><input id="pdi-engine" name="engineNumber" className={`${input} font-mono uppercase`} /></div>
            <div><label htmlFor="pdi-colour" className={label}>Colour</label><input id="pdi-colour" name="colour" className={input} /></div>
            <div><label htmlFor="pdi-year" className={label}>Model year</label><input id="pdi-year" name="modelYear" inputMode="numeric" className={input} /></div>
            {branches.length > 1 ? (
              <div><label htmlFor="pdi-branch" className={label}>Plant</label>
                <select id="pdi-branch" name="branchId" defaultValue={defaultBranchId ?? branches[0]?.id} className={input}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.sapPlant ? ` (SAP plant ${b.sapPlant})` : ''}</option>)}</select></div>
            ) : null}
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold text-[var(--ejo-text)]">SAP numbers (if you have them — they can be added later)</legend>
            <div><label htmlFor="pdi-matnr" className={label}>Material (MATNR)</label><input id="pdi-matnr" name="sapMaterial" className={`${input} font-mono uppercase`} /></div>
            <div><label htmlFor="pdi-aufnr" className={label}>Production order (AUFNR)</label><input id="pdi-aufnr" name="sapProductionOrder" className={`${input} font-mono`} /></div>
            <div><label htmlFor="pdi-equnr" className={label}>Equipment (EQUNR)</label><input id="pdi-equnr" name="sapEquipment" className={`${input} font-mono`} /></div>
          </fieldset>
          <button type="submit" disabled={busy} className="ejo-press inline-flex min-h-11 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Registering…' : 'Register and start the PDI'}</button>
        </form>
      ) : null}
    </div>
  );
}
