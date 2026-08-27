'use client';

import { useState } from 'react';

export type PaymentAmountOption = {
  /** e.g. "SEVENTY_PERCENT", "FULL", "REMAINING" — anything except the
   * reserved "OTHER", which always means "let me type my own". */
  key: string;
  /** What's shown in the dropdown, with the real amount spelled out —
   * e.g. "70% deposit (₦8,400.00)". */
  label: string;
  /** Exact numeric value as a string, e.g. "8400.00" — computed
   * server-side from the real estimate/payment data, never guessed on
   * the client. */
  value: string;
};

/**
 * One flow, not two competing fields. The actual bug this fixes: a
 * dropdown that pre-selects "70% deposit" by default, sitting next to
 * an always-visible text box someone could type a different number
 * into — the two could silently disagree, and the server ended up
 * trusting the stale dropdown selection over what was actually typed.
 *
 * Here, only one thing is ever visible and editable at a time: the
 * dropdown, or the manual entry box, never both. Choosing "70%",
 * "Full", or "Remaining" sets the amount directly from that option's
 * real value — nothing further to type. Choosing "Other" reveals a
 * single entry box for a custom amount; every other option disappears.
 * A single hidden field always carries whichever value is actually
 * current, so the server only ever receives one real number — there's
 * structurally no way for two different amounts to exist at once.
 */
export function PaymentAmountField({ options }: { options: PaymentAmountOption[] }) {
  const [selected, setSelected] = useState('');
  const [customValue, setCustomValue] = useState('');

  const isOther = selected === 'OTHER';
  const selectedOption = options.find((o) => o.key === selected);
  const amount = isOther ? customValue : (selectedOption?.value ?? '');

  return (
    <>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        required
        className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
      >
        <option value="" disabled>
          Select amount…
        </option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
        <option value="OTHER">Other amount</option>
      </select>
      {isOther ? (
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder="Enter amount"
          className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
        />
      ) : null}
      <input type="hidden" name="amount" value={amount} />
    </>
  );
}
