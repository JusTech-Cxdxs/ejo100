'use client';

import { useState } from 'react';

export type PaymentAmountOption = {
  /** e.g. "SEVENTY_PERCENT", "FULL", "REMAINING" — anything except the
   * reserved "OTHER", which always means "let me type my own". */
  key: string;
  /** What's shown in the dropdown, with the real amount spelled out —
   * e.g. "70% deposit (₦8,400.00)". */
  label: string;
  /** Exact value as a string, e.g. "8400.00", computed on the server. */
  value: string;
};

/**
 * Payment amount: pick a suggested amount, or "Other" to type one. Only one
 * input is visible at a time and a single hidden field carries the value,
 * so the dropdown and a typed amount can never disagree.
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
