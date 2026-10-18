'use client';

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/customer/Icon';
import { Spinner } from '@/components/Spinner';
import { activateDeviceWarranty, registerDealerDevice, uploadPaymentProof, reportDeviceFault } from '@/lib/customer-portal/zinox-actions';
import type { ActionState } from '@/lib/customer-portal/actions';

/**
 * The customer's own forms for the Zinox edition: activate a warranty,
 * register a device bought from a dealer, send proof of payment, report a
 * fault. Each posts to one server action that re-checks who is signed in.
 */

const initial: ActionState = { ok: false };
const field = 'w-full rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-bg)] px-3.5 py-2.5 text-base text-[var(--ejo-text)] outline-none placeholder:text-[var(--ejo-text-muted)]/70 focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20 sm:text-sm';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60';
const buttonLine = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] disabled:opacity-60';

function Outcome({ state }: { state: ActionState }) {
  if (!state.error && !state.message) return null;
  return (
    <p key={state.at ?? state.error} role={state.ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm ${state.ok ? 'bg-[var(--ejo-success)]/10' : 'bg-[var(--ejo-error)]/10'}`}>
      <span className={`mt-px shrink-0 ${state.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}><Icon name={state.ok ? 'checkCircle' : 'alert'} size={16} /></span>
      <span className="text-[var(--ejo-text)]">{state.ok ? state.message : state.error}</span>
    </p>
  );
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--ejo-text)]">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && !error ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-[var(--ejo-error)]">{error}</p> : null}
    </div>
  );
}

/** One button on a device card: activates the product warranty for that unit. */
export function ActivateWarrantyForm({ unitId, product }: { unitId: string; product: string }) {
  const [state, action, pending] = useActionState(activateDeviceWarranty, initial);
  return (
    <form action={action} className="space-y-2" data-testid={`activate-${unitId}`}>
      <input type="hidden" name="unitId" value={unitId} />
      <button type="submit" disabled={pending || state.ok} className={buttonLine} aria-label={`Activate the warranty on ${product}`}>
        {pending ? <Spinner /> : <Icon name="shield" size={16} />}{pending ? 'Activating…' : state.ok ? 'Activated' : 'Activate warranty'}
      </button>
      <Outcome state={state} />
    </form>
  );
}

/** Register a device bought from a dealer: serial + proof note; the unit must exist and not belong to anyone yet. */
export function RegisterDeviceForm() {
  const [state, action, pending] = useActionState(registerDealerDevice, initial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at) form.current?.reset(); }, [state.ok, state.at]);
  const err = state.fieldErrors ?? {};
  return (
    <form ref={form} action={action} className="space-y-4" noValidate data-testid="register-device">
      <Field id="dev-serial" label="Serial number" error={err.serial} hint="On the label under the device or on its box, e.g. ZNX26LP0001234.">
        <input id="dev-serial" name="serial" required minLength={3} maxLength={60} autoCapitalize="characters" aria-invalid={Boolean(err.serial) || undefined} className={`${field} ${err.serial ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'} uppercase`} />
      </Field>
      <Field id="dev-proof" label="Proof of purchase" error={err.proof} hint="The dealer you bought it from, the receipt or invoice number, and the date.">
        <textarea id="dev-proof" name="proof" required rows={3} maxLength={500} aria-invalid={Boolean(err.proof) || undefined} className={`${field} ${err.proof ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`} placeholder="e.g. Bought from TechPoint Computers, Computer Village, receipt TP-20931, 12 March 2026." />
      </Field>
      <Outcome state={state} />
      <button type="submit" disabled={pending} className={button}>{pending ? <Spinner /> : <Icon name="plus" size={16} />}{pending ? 'Registering…' : 'Register device'}</button>
    </form>
  );
}

/** Proof of a payment made against one of the customer's orders (recorded as pending until Finance confirms it). */
export function PaymentProofForm({ orderId, orderNumber, outstanding }: { orderId: string; orderNumber: string; outstanding: number }) {
  const [state, action, pending] = useActionState(uploadPaymentProof, initial);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at) { form.current?.reset(); setOpen(false); } }, [state.ok, state.at]);
  const err = state.fieldErrors ?? {};
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return (
    <div className="space-y-3" data-testid={`proof-${orderId}`}>
      {!open && !state.ok ? <button type="button" onClick={() => setOpen(true)} className={buttonLine}><Icon name="bank" size={16} />Upload payment proof</button> : null}
      <Outcome state={state} />
      {open ? (
        <form ref={form} action={action} className="space-y-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4" noValidate>
          <input type="hidden" name="orderId" value={orderId} />
          <p className="text-sm text-[var(--ejo-text)]">Tell us about the payment you made on <span className="font-semibold">{orderNumber}</span>. Finance confirms it against the bank statement, usually within one working day.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`amt-${orderId}`} label="Amount paid (₦)" error={err.amount}>
              <input id={`amt-${orderId}`} name="amount" type="number" min="1" step="0.01" defaultValue={outstanding} required aria-invalid={Boolean(err.amount) || undefined} className={`${field} ${err.amount ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`} />
            </Field>
            <Field id={`mtd-${orderId}`} label="How you paid" error={err.method}>
              <select id={`mtd-${orderId}`} name="method" defaultValue="BANK_TRANSFER" className={`${field} border-[var(--ejo-border)]`}>
                <option value="BANK_TRANSFER">Bank transfer</option><option value="POS">POS</option><option value="CHEQUE">Cheque</option><option value="ONLINE">Online</option><option value="CASH">Cash at the branch</option>
              </select>
            </Field>
            <Field id={`ref-${orderId}`} label="Reference" error={err.reference} hint="The transfer narration, POS slip or cheque number.">
              <input id={`ref-${orderId}`} name="reference" required minLength={3} maxLength={120} aria-invalid={Boolean(err.reference) || undefined} className={`${field} ${err.reference ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`} />
            </Field>
            <Field id={`date-${orderId}`} label="Date paid" error={err.paidAt}>
              <input id={`date-${orderId}`} name="paidAt" type="date" defaultValue={today} max={today} className={`${field} ${err.paidAt ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`} />
            </Field>
          </div>
          <Field id={`note-${orderId}`} label="Note (optional)" error={err.proofNote} hint="Bank, account name used, or anything that helps match the payment.">
            <textarea id={`note-${orderId}`} name="proofNote" rows={2} maxLength={500} className={`${field} border-[var(--ejo-border)]`} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={button}>{pending ? <Spinner /> : <Icon name="check" size={16} />}{pending ? 'Sending…' : 'Send payment proof'}</button>
            <button type="button" onClick={() => setOpen(false)} className={buttonLine}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/** Report a fault on one of the customer's devices. */
export function ReportFaultForm({ devices }: { devices: { id: string; label: string; covered: boolean }[] }) {
  const [state, action, pending] = useActionState(reportDeviceFault, initial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at) form.current?.reset(); }, [state.ok, state.at]);
  const err = state.fieldErrors ?? {};
  return (
    <form ref={form} action={action} className="space-y-4" noValidate data-testid="report-fault">
      <Field id="fault-unit" label="Which device?" error={err.unitId}>
        <select id="fault-unit" name="unitId" required defaultValue="" aria-invalid={Boolean(err.unitId) || undefined} className={`${field} ${err.unitId ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`}>
          <option value="" disabled>Choose a device…</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.label}{d.covered ? ' — under warranty' : ' — out of warranty'}</option>)}
        </select>
      </Field>
      <Field id="fault-text" label="What is wrong?" error={err.fault} hint="What happens, since when, and anything you have already tried.">
        <textarea id="fault-text" name="fault" required rows={4} minLength={10} maxLength={1500} aria-invalid={Boolean(err.fault) || undefined} className={`${field} ${err.fault ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`} placeholder="e.g. The laptop no longer charges — the light on the charger flickers and the battery drains within an hour." />
      </Field>
      <Outcome state={state} />
      <button type="submit" disabled={pending} className={button}>{pending ? <Spinner /> : <Icon name="wrench" size={16} />}{pending ? 'Sending…' : 'Report the fault'}</button>
    </form>
  );
}
