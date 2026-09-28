'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';

export type PartPolicyOption = { id: string; name: string; code: string; term: string; km: number | null; covers: string; remedy: string; provider: string; isSample: boolean };

/**
 * On part creation: "Does this part carry a warranty?" — a deliberate
 * Yes / No (nothing pre-selected). Yes reveals the warranty policy to
 * attach; every unit released to a customer then gets its own warranty
 * number automatically.
 */
export function PartWarrantyChoice({
  policies,
  search,
  loadDefaultOptions,
}: {
  policies: PartPolicyOption[];
  search: (query: string) => Promise<SearchableOption[]>;
  loadDefaultOptions: () => Promise<SearchableOption[]>;
}) {
  const [choice, setChoice] = useState('');
  const [policyId, setPolicyId] = useState('');
  const picked = policies.find((p) => p.id === policyId);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  return (
    <div className="space-y-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
      <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Does this part carry a warranty?</label>
      <select name="warrantyChoice" required value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
        <option value="" disabled>Choose…</option>
        <option value="YES">Yes — it carries a warranty</option>
        <option value="NO">No warranty</option>
      </select>
      {choice === 'YES' ? (
        policies.length === 0 ? (
          <p className="text-xs text-[var(--ejo-warning)]">
            No active part warranty policies yet — ask the Warranty HOD to add one under Warranty → Policies, or choose &ldquo;No warranty&rdquo; for now and set it on the part later.
          </p>
        ) : (
          <>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Warranty policy</label>
            <SearchableSelect
              name="warrantyPolicyId"
              required
              search={search}
              loadDefaultOptions={loadDefaultOptions}
              defaultOptionsLabel="Active part policies"
              placeholder="Search policies by name, code or provider…"
              emptyMessage="No active part policy matches."
              minQueryLength={1}
              onChange={setPolicyId}
            />
            {picked ? (
              <p className="text-xs text-[var(--ejo-text-muted)]">
                {picked.code} · {picked.term}{picked.km ? ` / ${picked.km.toLocaleString('en-NG')} km` : ''} · {picked.provider} · pays for {picked.covers} · remedy: {picked.remedy}. Every unit released to a customer gets its own warranty number.
              </p>
            ) : null}
          </>
        )
      ) : choice === 'NO' ? (
        <p className="text-xs text-[var(--ejo-text-muted)]">Units of this part will be released without a warranty number. A warranty can be added later on the part page.</p>
      ) : null}
    </div>
  );
}
