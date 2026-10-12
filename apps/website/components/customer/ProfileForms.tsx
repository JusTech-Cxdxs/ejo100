'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { PasswordField, StrengthMeter } from './PasswordField';
import { Spinner } from '@/components/Spinner';
import {
  addAddress, changePassword, removeAddress, updateAddress, updateContactDetails, updateEmailPreference, type ActionState,
} from '@/lib/customer-portal/actions';
import { playChime, setSoundEnabled, soundEnabled } from '@/lib/customer-portal/sound';

const initial: ActionState = { ok: false };

const input = 'w-full rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-bg)] px-3.5 py-2.5 text-sm text-[var(--ejo-text)] outline-none transition-colors placeholder:text-[var(--ejo-text-muted)]/70 focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20';
const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60';
const ghostBtn = 'inline-flex items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/40';

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-[var(--ejo-error)]">{error}</p> : hint ? <div className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">{hint}</div> : null}
    </div>
  );
}

function Banner({ state }: { state: ActionState }) {
  if (!state.error && !state.message) return null;
  const ok = state.ok;
  return (
    <div role={ok ? 'status' : 'alert'} className={`ejo-rise flex items-start gap-2.5 rounded-[var(--ejo-radius-md)] border px-3.5 py-2.5 text-sm ${ok ? 'border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/[0.08]' : 'border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/[0.07]'}`}>
      <span className={`mt-px shrink-0 ${ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}><Icon name={ok ? 'checkCircle' : 'alert'} size={17} /></span>
      <span className="text-[var(--ejo-text)]">{ok ? state.message : state.error}</span>
    </div>
  );
}

const cls = (bad?: string) => `${input} ${bad ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`;

// ------------------------------------------------------------- Contact details

export function ContactForm({ phone, altPhone, address }: { phone: string; altPhone: string; address: string }) {
  const [state, action, pending] = useActionState(updateContactDetails, initial);
  const [addr, setAddr] = useState(address);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label="Phone number" error={fe.phone}>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} defaultValue={phone} aria-invalid={Boolean(fe.phone) || undefined} aria-describedby={fe.phone ? 'phone-error' : undefined} className={cls(fe.phone)} placeholder="e.g. 0803 123 4567" />
        </Field>
        <Field id="altPhone" label="Second phone (optional)" error={fe.altPhone}>
          <input id="altPhone" name="altPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} defaultValue={altPhone} aria-invalid={Boolean(fe.altPhone) || undefined} aria-describedby={fe.altPhone ? 'altPhone-error' : undefined} className={cls(fe.altPhone)} placeholder="Another number we can reach you on" />
        </Field>
      </div>
      <Field id="address" label="Main address" error={fe.address} hint={<span className="flex justify-between gap-2"><span>Short — it’s printed on your Job Cards.</span><span className={addr.length > 80 ? 'text-[var(--ejo-error)]' : ''}>{addr.length}/80</span></span>}>
        <input id="address" name="address" required maxLength={120} value={addr} onChange={(e) => setAddr(e.target.value)} autoComplete="street-address" aria-invalid={Boolean(fe.address) || undefined} aria-describedby={fe.address ? 'address-error' : undefined} className={cls(fe.address)} placeholder="e.g. 12 Adeola Odeku St, Victoria Island" />
      </Field>
      <Banner key={state.at ?? state.error} state={state} />
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? <Spinner /> : <Icon name="check" size={16} strokeWidth={2.4} />}{pending ? 'Saving…' : 'Save contact details'}</button>
    </form>
  );
}

// ------------------------------------------------------------- Extra addresses

export type AddressView = { id: string; label: string | null; line1: string; line2: string | null; city: string | null; state: string | null; country: string | null };

function AddressFields({ a, fe, idPrefix }: { a?: AddressView; fe: Record<string, string>; idPrefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id={`${idPrefix}-label`} label="Label (optional)" error={fe.label}><input id={`${idPrefix}-label`} name="label" maxLength={40} defaultValue={a?.label ?? ''} placeholder="Home, Office…" className={cls(fe.label)} /></Field>
      <Field id={`${idPrefix}-line1`} label="Street address" error={fe.line1}><input id={`${idPrefix}-line1`} name="line1" required maxLength={120} defaultValue={a?.line1 ?? ''} className={cls(fe.line1)} /></Field>
      <Field id={`${idPrefix}-line2`} label="Area / landmark (optional)" error={fe.line2}><input id={`${idPrefix}-line2`} name="line2" maxLength={120} defaultValue={a?.line2 ?? ''} className={cls(fe.line2)} /></Field>
      <Field id={`${idPrefix}-city`} label="City (optional)" error={fe.city}><input id={`${idPrefix}-city`} name="city" maxLength={60} defaultValue={a?.city ?? ''} className={cls(fe.city)} /></Field>
      <Field id={`${idPrefix}-state`} label="State (optional)" error={fe.state}><input id={`${idPrefix}-state`} name="state" maxLength={60} defaultValue={a?.state ?? ''} className={cls(fe.state)} /></Field>
      <Field id={`${idPrefix}-country`} label="Country (optional)" error={fe.country}><input id={`${idPrefix}-country`} name="country" maxLength={60} defaultValue={a?.country ?? 'Nigeria'} className={cls(fe.country)} /></Field>
    </div>
  );
}

function AddressRow({ a }: { a: AddressView }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(updateAddress, initial);
  const [rmState, rmAction, removing] = useActionState(removeAddress, initial);
  useEffect(() => { if (state.ok && state.at) setEditing(false); }, [state]);
  const text = [a.line1, a.line2, a.city, a.state, a.country].filter(Boolean).join(', ');
  if (editing) {
    return (
      <li className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-bg)] p-4">
        <form action={action} className="space-y-3" noValidate>
          <input type="hidden" name="id" value={a.id} />
          <AddressFields a={a} fe={state.fieldErrors ?? {}} idPrefix={`edit-${a.id}`} />
          <Banner key={state.at ?? state.error} state={state} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primaryBtn}>{pending ? <Spinner /> : null}{pending ? 'Saving…' : 'Save address'}</button>
            <button type="button" onClick={() => setEditing(false)} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="pin" size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ejo-text)]">{a.label || 'Address'}</p>
        <p className="break-words text-sm text-[var(--ejo-text-muted)]">{text}</p>
        {rmState.error ? <p className="mt-1 text-xs text-[var(--ejo-error)]" role="alert">{rmState.error}</p> : null}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {confirming ? (
          <form action={rmAction} className="flex gap-1.5">
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" disabled={removing} className="rounded-full bg-[var(--ejo-error)] px-3 py-1.5 text-xs font-semibold text-white">{removing ? 'Removing…' : 'Yes, remove'}</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)]">Keep</button>
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${a.label || 'address'}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]"><Icon name="edit" size={14} /></button>
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Remove ${a.label || 'address'}`} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-error)]"><Icon name="trash" size={14} /></button>
          </>
        )}
      </div>
    </li>
  );
}

export function AddressManager({ addresses, max }: { addresses: AddressView[]; max: number }) {
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(addAddress, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && state.at) { setAdding(false); formRef.current?.reset(); } }, [state]);
  return (
    <div className="space-y-3">
      {addresses.length ? <ul className="space-y-3">{addresses.map((a) => <AddressRow key={a.id} a={a} />)}</ul> : <p className="text-sm text-[var(--ejo-text-muted)]">No extra addresses yet — add an office or a second home if it helps us reach you.</p>}
      {state.ok && state.message && !adding ? <Banner key={state.at} state={state} /> : null}
      {adding ? (
        <form ref={formRef} action={action} className="space-y-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-bg)] p-4" noValidate>
          <AddressFields fe={state.fieldErrors ?? {}} idPrefix="new" />
          {!state.ok ? <Banner key={state.at ?? state.error} state={state} /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={primaryBtn}>{pending ? <Spinner /> : <Icon name="plus" size={16} />}{pending ? 'Adding…' : 'Add address'}</button>
            <button type="button" onClick={() => setAdding(false)} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      ) : addresses.length < max ? (
        <button type="button" onClick={() => setAdding(true)} className={ghostBtn}><Icon name="plus" size={16} /> Add another address</button>
      ) : (
        <p className="text-xs text-[var(--ejo-text-muted)]">You have the maximum of {max} extra addresses.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Preferences

function Toggle({ id, checked, onChange, label, description, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium text-[var(--ejo-text)]">{label}</p>
        <p id={`${id}-desc`} className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ejo-primary)]/40 disabled:opacity-60 ${checked ? 'bg-[var(--ejo-primary)]' : 'bg-[var(--ejo-border)]'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export function PreferencesForm({ notifyByEmail }: { notifyByEmail: boolean }) {
  const [email, setEmail] = useState(notifyByEmail);
  const [sound, setSound] = useState(true);
  const [state, action, pending] = useActionState(updateEmailPreference, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { setSound(soundEnabled()); }, []);
  return (
    <div className="space-y-5">
      <form ref={formRef} action={action}>
        <input type="hidden" name="notifyByEmail" value={email ? 'on' : 'off'} />
        <Toggle
          id="pref-email"
          checked={email}
          disabled={pending}
          onChange={(v) => { setEmail(v); setTimeout(() => formRef.current?.requestSubmit(), 0); }}
          label="Email me updates too"
          description="Estimates, ready-for-collection notices and receipts by email, as well as here."
        />
      </form>
      <Toggle
        id="pref-sound"
        checked={sound}
        onChange={(v) => { setSound(v); setSoundEnabled(v); if (v) playChime(true); }}
        label="Notification sound"
        description="A soft chime when something new arrives while the portal is open. Saved on this device."
      />
      <button type="button" onClick={() => playChime(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ejo-primary)] hover:underline"><Icon name="volume" size={14} /> Play the sound</button>
      <Banner key={state.at ?? state.error} state={state} />
    </div>
  );
}

// ------------------------------------------------------------- Password

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const fe = state.fieldErrors ?? {};
  useEffect(() => { if (state.ok && state.at) { setCurrent(''); setNext(''); setConfirm(''); } }, [state]);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="text" name="username" autoComplete="username" className="hidden" aria-hidden="true" tabIndex={-1} readOnly />
      <div>
        <PasswordField id="currentPassword" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" invalid={Boolean(fe.currentPassword)} describedBy={fe.currentPassword ? 'currentPassword-error' : undefined} />
        <input type="hidden" name="currentPassword" value={current} />
        {fe.currentPassword ? <p id="currentPassword-error" className="mt-1.5 text-xs font-medium text-[var(--ejo-error)]">{fe.currentPassword}</p> : null}
      </div>
      <div>
        <PasswordField id="newPassword" label="New password" value={next} onChange={setNext} autoComplete="new-password" minLength={8} invalid={Boolean(fe.newPassword)} describedBy={fe.newPassword ? 'newPassword-error' : undefined} />
        <input type="hidden" name="newPassword" value={next} />
        <StrengthMeter password={next} />
        {fe.newPassword ? <p id="newPassword-error" className="mt-1.5 text-xs font-medium text-[var(--ejo-error)]">{fe.newPassword}</p> : null}
      </div>
      <div>
        <PasswordField id="confirmPassword" label="Type the new password again" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(fe.confirmPassword) || (Boolean(confirm) && confirm !== next)} describedBy={fe.confirmPassword ? 'confirmPassword-error' : undefined} />
        <input type="hidden" name="confirmPassword" value={confirm} />
        {fe.confirmPassword ? <p id="confirmPassword-error" className="mt-1.5 text-xs font-medium text-[var(--ejo-error)]">{fe.confirmPassword}</p> : null}
      </div>
      <Banner key={state.at ?? state.error} state={state} />
      <button type="submit" disabled={pending} className={primaryBtn}>{pending ? <Spinner /> : <Icon name="key" size={16} />}{pending ? 'Changing…' : 'Change password'}</button>
    </form>
  );
}
