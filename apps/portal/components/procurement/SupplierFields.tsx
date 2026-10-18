import { CURRENCIES } from '@/lib/procurement-core';
import { INPUT, LABEL } from '@/components/warehouse/forms';

type Defaults = { name?: string; country?: string | null; currency?: string; contactName?: string | null; email?: string | null; phone?: string | null; address?: string | null; paymentTerms?: string | null; leadTimeDays?: number | null };

/** The supplier form fields, shared by "add" and "edit". */
export function SupplierFields({ d = {} }: { d?: Defaults }) {
  const currencies = [...CURRENCIES] as string[];
  if (d.currency && !currencies.includes(d.currency)) currencies.unshift(d.currency);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={`${LABEL} sm:col-span-2`}>Name<input name="name" required minLength={2} maxLength={160} defaultValue={d.name ?? ''} className={`${INPUT} mt-1`} placeholder="e.g. Shenzhen Panel Co." /></label>
      <label className={LABEL}>Country<input name="country" maxLength={80} defaultValue={d.country ?? ''} className={`${INPUT} mt-1`} placeholder="e.g. China, Nigeria" /></label>
      <label className={LABEL}>Currency
        <select name="currency" defaultValue={d.currency ?? 'USD'} className={`${INPUT} mt-1`}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </label>
      <label className={LABEL}>Contact person<input name="contactName" maxLength={120} defaultValue={d.contactName ?? ''} className={`${INPUT} mt-1`} /></label>
      <label className={LABEL}>Email<input name="email" type="email" maxLength={160} defaultValue={d.email ?? ''} className={`${INPUT} mt-1`} /></label>
      <label className={LABEL}>Phone<input name="phone" maxLength={40} defaultValue={d.phone ?? ''} className={`${INPUT} mt-1`} inputMode="tel" /></label>
      <label className={LABEL}>Lead time (days)<input name="leadTimeDays" type="number" min="0" step="1" defaultValue={d.leadTimeDays ?? ''} className={`${INPUT} mt-1`} /></label>
      <label className={`${LABEL} sm:col-span-2`}>Address<input name="address" maxLength={400} defaultValue={d.address ?? ''} className={`${INPUT} mt-1`} /></label>
      <label className={`${LABEL} sm:col-span-2`}>Payment terms<input name="paymentTerms" maxLength={200} defaultValue={d.paymentTerms ?? ''} className={`${INPUT} mt-1`} placeholder="e.g. 30% deposit, balance before shipment" /></label>
    </div>
  );
}
