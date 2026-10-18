'use client';

import { useEffect, useState, useTransition } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';

type Location = { id: string; name: string; branch: string; kind: string };
type Unit = { id: string; serialNumber: string; product: { id: string; name: string; sku: string }; configuration: { name: string } | null };

const INPUT = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';

/**
 * Choose the units a transfer takes: the source location, then (optionally)
 * one product, then tick serials from what is in stock there. Submits
 * fromLocationId, toLocationId and one unitIds value per ticked unit.
 */
export function UnitPicker({ locations, searchProducts, loadUnits }: { locations: Location[]; searchProducts: (q: string) => Promise<SearchableOption[]>; loadUnits: (locationId: string, productId?: string) => Promise<Unit[]> }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [productId, setProductId] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!from) { setUnits([]); setPicked(new Set()); return; }
    start(async () => {
      const rows = await loadUnits(from, productId || undefined).catch(() => []);
      setUnits(rows);
      setPicked(new Set());
    });
  }, [from, productId, loadUnits]);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = () => setPicked(new Set(units.map((u) => u.id)));
  const none = () => setPicked(new Set());

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">
          From
          <select name="fromLocationId" required className={`${INPUT} mt-1`} value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Choose a location…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.branch}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">
          To
          <select name="toLocationId" required className={`${INPUT} mt-1`} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a destination…</option>
            {locations.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.name} — {l.branch}</option>)}
          </select>
        </label>
      </div>
      <div>
        <label htmlFor="transfer-product" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Product (optional — narrows the list)</label>
        <div className="mt-1">
          <SearchableSelect id="transfer-product" name="productFilter" search={searchProducts} loadDefaultOptions={() => searchProducts('')} defaultOptionsLabel="Products" placeholder="Search products…" onChange={setProductId} minQueryLength={0} />
        </div>
      </div>
      <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ejo-border)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
          <span>{!from ? 'Choose the source location to see its units.' : pending ? 'Loading units…' : `${units.length} in stock${productId ? ' for this product' : ''} · ${picked.size} picked`}</span>
          {units.length ? (
            <span className="flex gap-3">
              <button type="button" className="text-[var(--ejo-primary)] hover:underline" onClick={all}>Pick all</button>
              <button type="button" className="text-[var(--ejo-primary)] hover:underline" onClick={none}>Clear</button>
            </span>
          ) : null}
        </div>
        <ul className="max-h-80 divide-y divide-[var(--ejo-border)] overflow-y-auto">
          {units.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--ejo-bg)]">
                <input type="checkbox" name="unitIds" value={u.id} checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                <span className="font-mono text-[var(--ejo-text)]">{u.serialNumber}</span>
                <span className="text-[var(--ejo-text-muted)]">{u.product.name}{u.configuration ? ` · ${u.configuration.name}` : ''}</span>
              </label>
            </li>
          ))}
          {from && !pending && units.length === 0 ? <li className="px-3 py-3 text-sm text-[var(--ejo-text-muted)]">Nothing in stock here{productId ? ' for that product' : ''}.</li> : null}
        </ul>
      </div>
    </div>
  );
}
