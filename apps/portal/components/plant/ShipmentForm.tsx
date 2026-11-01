'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { addKitsToShipment, createShipment } from '@/lib/actions/plant-kits';
import { PLANT_MODELS } from '@/lib/plant/pdi';
import { KIT_TYPES, KIT_TYPE_WORDS, parseKitLines, type KitType } from '@/lib/plant/kits';
import { lagosDayKey } from '@/lib/utils/format-date';

const lagosToday = () => lagosDayKey(new Date());

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const EXAMPLE = 'JAANLR85EL7100101, 4HK1-123456, NQR, LOT-2611-01, 14';

/** The kits as pasted: how many are ready, and what is wrong with the rest — before anything is sent. */
function KitLines({ value, onChange, modelCode, kitType, setModel, setType }: { value: string; onChange: (v: string) => void; modelCode: string; kitType: string; setModel: (v: string) => void; setType: (v: string) => void }) {
  const parsed = useMemo(() => parseKitLines(value, { modelCode: modelCode || null, kitType: (KIT_TYPES.includes(kitType as KitType) ? kitType : null) as KitType | null }), [value, modelCode, kitType]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={label}>Model, when a line leaves it out</span>
          <select value={modelCode} onChange={(e) => setModel(e.target.value)} className={input}>
            <option value="">Each line names its model</option>
            {PLANT_MODELS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Kit type</span>
          <select value={kitType} onChange={(e) => setType(e.target.value)} className={input}>
            <option value="">As the model usually arrives (Isuzu CKD, Soueast SKD)</option>
            {KIT_TYPES.map((t) => <option key={t} value={t}>{KIT_TYPE_WORDS[t]}</option>)}
          </select>
        </label>
      </div>
      <label className="block"><span className={label}>The kits, one per line, as on the packing list: VIN or frame number, engine number, model, lot, cases. Paste straight from Excel.</span>
        <textarea name="kits" value={value} onChange={(e) => onChange(e.target.value)} rows={8} spellCheck={false} placeholder={EXAMPLE} className={`${input} font-mono text-xs`} />
      </label>
      {value.trim() ? (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p className="text-[var(--ejo-text)]"><b>{parsed.kits.length}</b> {parsed.kits.length === 1 ? 'kit' : 'kits'} ready{parsed.kits.length ? `: ${[...new Set(parsed.kits.map((k) => `${k.modelCode} ${k.kitType}`))].join(', ')}` : ''}.</p>
          {parsed.problems.length ? <ul className="list-disc pl-5 text-[var(--ejo-error)]">{parsed.problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}{parsed.problems.length > 8 ? <li>And {parsed.problems.length - 8} more.</li> : null}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Record a shipment of kits as it arrives: the bill of lading, containers, SAP numbers, and its kits from the packing list. */
export function ShipmentForm({ branches, defaultBranchId }: { branches: { id: string; name: string; sapPlant: string | null }[]; defaultBranchId: string | null }) {
  const router = useRouter();
  const [kits, setKits] = useState('');
  const [modelCode, setModel] = useState('');
  const [kitType, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v: Record<string, string> = {};
    fd.forEach((val, k) => { if (typeof val === 'string') v[k] = val; });
    setBusy(true); setError(null);
    try {
      const r = await createShipment({ ...v, kits, modelCode, kitType });
      if (r.ok) { router.push(`/plant/shipments/${r.id}`); return; }
      setError(r.error);
    } catch { setError('That did not work. Check the connection and try again.'); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">The shipment</legend>
        <label className="block"><span className={label}>Plant</span>
          <select name="branchId" defaultValue={defaultBranchId && branches.some((b) => b.id === defaultBranchId) ? defaultBranchId : ''} required className={input}>
            <option value="" disabled>Choose the plant</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.sapPlant ? ` (SAP plant ${b.sapPlant})` : ''}</option>)}
          </select>
        </label>
        <label className="block"><span className={label}>Supplier</span><input name="supplier" required maxLength={120} placeholder="e.g. Isuzu Motors Ltd" className={input} /></label>
        <label className="block"><span className={label}>Arrived on</span><input name="arrivedAt" type="date" required defaultValue={lagosToday()} max={lagosToday()} className={input} /></label>
        <label className="block"><span className={label}>Shipped from (optional)</span><input name="origin" maxLength={80} placeholder="e.g. Japan, Tokyo port" className={input} /></label>
        <label className="block"><span className={label}>Bill of lading (optional)</span><input name="billOfLading" maxLength={40} className={`${input} font-mono uppercase`} /></label>
        <label className="block"><span className={label}>Vessel (optional)</span><input name="vessel" maxLength={80} className={input} /></label>
        <label className="block sm:col-span-2 lg:col-span-1"><span className={label}>Containers (optional, separated by spaces or commas)</span><input name="containers" maxLength={800} placeholder="e.g. MSCU1234567 TGHU7654321" className={`${input} font-mono uppercase`} /></label>
        <label className="block"><span className={label}>SAP purchase order, EBELN (optional)</span><input name="sapPurchaseOrder" maxLength={20} inputMode="numeric" className={`${input} font-mono`} /></label>
        <label className="block"><span className={label}>SAP inbound delivery, VBELN (optional)</span><input name="sapInboundDelivery" maxLength={20} inputMode="numeric" className={`${input} font-mono`} /></label>
        <label className="block sm:col-span-2 lg:col-span-3"><span className={label}>Notes (optional)</span><textarea name="notes" maxLength={1000} rows={2} className={input} /></label>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Its kits</legend>
        <KitLines value={kits} onChange={setKits} modelCode={modelCode} kitType={kitType} setModel={setModel} setType={setType} />
      </fieldset>
      {error ? <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/10 px-4 py-2 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      <button type="submit" disabled={busy} className="ejo-press inline-flex min-h-11 items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 text-sm font-semibold text-white disabled:opacity-50"><Icon name="check" size={16} />{busy ? 'Recording…' : 'Record the shipment'}</button>
    </form>
  );
}

/** More kits for a shipment already recorded. */
export function AddKits({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [kits, setKits] = useState('');
  const [modelCode, setModel] = useState('');
  const [kitType, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await addKitsToShipment(shipmentId, { kits, modelCode, kitType });
      if (r.ok) { setKits(''); setMsg({ ok: true, text: `${r.added} ${r.added === 1 ? 'kit' : 'kits'} added.` }); router.refresh(); }
      else setMsg({ ok: false, text: r.error });
    } catch { setMsg({ ok: false, text: 'That did not work. Try again.' }); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <KitLines value={kits} onChange={setKits} modelCode={modelCode} kitType={kitType} setModel={setModel} setType={setType} />
      {msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{msg.text}</p> : null}
      <button type="submit" disabled={busy || !kits.trim()} className="ejo-press inline-flex min-h-11 items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)] px-4 text-sm font-semibold text-[var(--ejo-primary)] disabled:opacity-50">{busy ? 'Adding…' : 'Add the kits'}</button>
    </form>
  );
}
