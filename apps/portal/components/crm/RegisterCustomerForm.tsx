'use client';

import { useActionState, useState } from 'react';
import { registerCustomerAction, type CustomerFormState } from '@/lib/actions/crm-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/20';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const req = <span className="text-[var(--ejo-error)]">*</span>;
const PHONE_PATTERN = '\\+?[0-9 ]{7,20}';

/** Register a customer: primary address and phone required; what was typed stays when something is wrong. */
export function RegisterCustomerForm() {
  const [state, action] = useActionState<CustomerFormState, FormData>(registerCustomerAction, { error: null, values: {} });
  const v = state.values;
  const [address, setAddress] = useState('');
  const [type, setType] = useState(v.customerType || 'INDIVIDUAL');
  return (
    <form action={action} autoComplete="off" className="relative grid gap-4 border-t border-[var(--ejo-border)] px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
      <FormPendingOverlay />
      <div>
        <label className={labelCls} htmlFor="reg-type">Customer type {req}</label>
        <select id="reg-type" name="customerType" required value={type} onChange={(e) => setType(e.target.value)} className={field}>
          <option value="INDIVIDUAL">Individual</option>
          <option value="ORGANIZATION">Organisation (company / fleet)</option>
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="reg-name">{type === 'ORGANIZATION' ? 'Organisation name' : 'Full name'} {req}</label>
        <input id="reg-name" name="fullName" required minLength={2} maxLength={120} defaultValue={v.fullName ?? ''} key={`n-${v.fullName ?? ''}`} placeholder={type === 'ORGANIZATION' ? 'e.g. Dangote Transport Ltd' : 'First and last name'} className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="reg-email">Email {req}</label>
        <input id="reg-email" name="email" type="email" required maxLength={200} defaultValue={v.email ?? ''} key={`e-${v.email ?? ''}`} placeholder="name@example.com" className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="reg-phone">Primary phone {req}</label>
        <input id="reg-phone" name="phone" type="tel" required minLength={7} maxLength={20} pattern={PHONE_PATTERN} title="Digits, spaces and a leading + (7–20 characters)" defaultValue={v.phone ?? ''} key={`p-${v.phone ?? ''}`} placeholder="0803 123 4567" className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="reg-alt">Second phone</label>
        <input id="reg-alt" name="altPhone" type="tel" maxLength={20} pattern={PHONE_PATTERN} title="Digits, spaces and a leading + (7–20 characters)" defaultValue={v.altPhone ?? ''} key={`a-${v.altPhone ?? ''}`} placeholder="Optional" className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="reg-tags">Tags</label>
        <input id="reg-tags" name="tags" maxLength={300} defaultValue={v.tags ?? ''} key={`t-${v.tags ?? ''}`} placeholder="Optional — e.g. Fleet, VIP" className={field} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label className={labelCls} htmlFor="reg-address">Primary address {req}</label>
        <input id="reg-address" name="address" required maxLength={80} defaultValue={v.address ?? ''} key={`ad-${v.address ?? ''}`} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Plot 3, Cheesebrough, Lagos" className={field} />
        <p className="mt-1 flex justify-between gap-3 text-[11px] text-[var(--ejo-text-muted)]">
          <span>One short line — it is printed on Job Cards. More addresses can be added on their page.</span>
          <span className="tabular-nums">{(address || v.address || '').length}/80</span>
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/[0.07] px-3 py-2 text-sm text-[var(--ejo-text)] sm:col-span-2 lg:col-span-3"><span className="font-semibold text-[var(--ejo-error)]">Not registered: </span>{state.error}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
        <p className="text-xs text-[var(--ejo-text-muted)]">If the email already belongs to one of your customers, their record opens instead — no duplicate. New customers get a welcome email with a link to set their own password.</p>
        <SubmitButton label="Register customer" pendingLabel="Registering…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95" />
      </div>
    </form>
  );
}
