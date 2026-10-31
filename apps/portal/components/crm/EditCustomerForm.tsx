'use client';

import { useActionState, useState } from 'react';
import { updateCustomerAction, type CustomerFormState } from '@/lib/actions/crm-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ejo-primary)]/20';
const labelCls = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
const req = <span className="text-[var(--ejo-error)]">*</span>;
const PHONE_PATTERN = '\\+?[0-9 ]{7,20}';

export type EditableCustomer = {
  id: string; fullName: string; customerType: string; email: string | null; phone: string | null; altPhone: string | null; address: string | null;
  tags: string[]; notifyByEmail: boolean; companyName: string | null; taxId: string | null;
};

/** Edit a customer's details. Every changed field goes to the audit trail as before → after. */
export function EditCustomerForm({ customer, cancelHref }: { customer: EditableCustomer; cancelHref: string }) {
  const [state, action] = useActionState<CustomerFormState, FormData>(updateCustomerAction, { error: null, values: {} });
  const has = Object.keys(state.values).length > 0;
  const v = (k: keyof CustomerFormState['values'] & string, fallback: string) => (has ? state.values[k] ?? '' : fallback);
  const [type, setType] = useState(customer.customerType);
  const [address, setAddress] = useState(customer.address ?? '');
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" aria-label="Edit customer">
      <FormPendingOverlay />
      <input type="hidden" name="customerId" value={customer.id} />
      <div>
        <label className={labelCls} htmlFor="ed-type">Customer type {req}</label>
        <select id="ed-type" name="customerType" value={type} onChange={(e) => setType(e.target.value)} className={field}>
          <option value="INDIVIDUAL">Individual</option>
          <option value="ORGANIZATION">Organisation (company / fleet)</option>
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="ed-name">{type === 'ORGANIZATION' ? 'Organisation name' : 'Full name'} {req}</label>
        <input id="ed-name" name="fullName" required minLength={2} maxLength={120} defaultValue={v('fullName', customer.fullName)} key={`n-${v('fullName', customer.fullName)}`} className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="ed-email">Email {customer.email ? req : null}</label>
        <input id="ed-email" name="email" type="email" required={Boolean(customer.email)} maxLength={200} defaultValue={v('email', customer.email ?? '')} key={`e-${v('email', customer.email ?? '')}`} className={field} />
        <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{customer.email ? 'They sign in to the customer portal with this email.' : 'No email on file. Add their own email to give them customer portal access and email updates; until then, reach them by phone.'}</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="ed-phone">Primary phone {req}</label>
        <input id="ed-phone" name="phone" type="tel" required minLength={7} maxLength={20} pattern={PHONE_PATTERN} title="Digits, spaces and a leading + (7–20 characters)" defaultValue={v('phone', customer.phone ?? '')} key={`p-${v('phone', customer.phone ?? '')}`} className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="ed-alt">Second phone</label>
        <input id="ed-alt" name="altPhone" type="tel" maxLength={20} pattern={PHONE_PATTERN} title="Digits, spaces and a leading + (7–20 characters)" defaultValue={v('altPhone', customer.altPhone ?? '')} key={`a-${v('altPhone', customer.altPhone ?? '')}`} placeholder="Optional" className={field} />
      </div>
      <div>
        <label className={labelCls} htmlFor="ed-tags">Tags</label>
        <input id="ed-tags" name="tags" maxLength={300} defaultValue={v('tags', customer.tags.join(', '))} key={`t-${v('tags', customer.tags.join(', '))}`} placeholder="e.g. Fleet, VIP" className={field} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="ed-address">Primary address {req}</label>
        <input id="ed-address" name="address" required maxLength={80} defaultValue={v('address', customer.address ?? '')} key={`ad-${v('address', customer.address ?? '')}`} onChange={(e) => setAddress(e.target.value)} className={field} />
        <p className="mt-1 flex justify-between gap-3 text-[11px] text-[var(--ejo-text-muted)]"><span>One short line, printed on Job Cards. Extra addresses: Contacts &amp; addresses.</span><span className="tabular-nums">{address.length}/80</span></p>
      </div>
      {type === 'ORGANIZATION' ? (
        <>
          <div>
            <label className={labelCls} htmlFor="ed-company">Registered company name</label>
            <input id="ed-company" name="companyName" maxLength={160} defaultValue={v('companyName', customer.companyName ?? '')} key={`c-${v('companyName', customer.companyName ?? '')}`} placeholder="Optional" className={field} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ed-tax">Tax ID (TIN)</label>
            <input id="ed-tax" name="taxId" maxLength={40} defaultValue={v('taxId', customer.taxId ?? '')} key={`x-${v('taxId', customer.taxId ?? '')}`} placeholder="Optional" className={field} />
          </div>
        </>
      ) : null}
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]">
          <input type="checkbox" name="notifyByEmail" value="yes" defaultChecked={has ? state.values.notifyByEmail === 'yes' : customer.notifyByEmail} className="h-4 w-4" />
          Also send them updates and broadcasts by email
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/[0.07] px-3 py-2 text-sm text-[var(--ejo-text)] sm:col-span-2"><span className="font-semibold text-[var(--ejo-error)]">Not saved: </span>{state.error}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
        <a href={cancelHref} className="rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Cancel</a>
        <SubmitButton label="Save changes" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95" />
      </div>
    </form>
  );
}
