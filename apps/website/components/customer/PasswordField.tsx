'use client';
// Copied from apps/portal/components (the apps never import across each other) — keep in step.

import { useId, useState, type KeyboardEvent } from 'react';

const base = 'w-full rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-bg)] py-3 pl-4 pr-12 text-sm text-[var(--ejo-text)] outline-none transition-colors placeholder:text-[var(--ejo-text-muted)]/70 focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20';

/**
 * A password input people can actually use: show / hide toggle (the eye),
 * a Caps Lock warning, the right autocomplete hint for password managers,
 * and an error state that screen readers announce.
 */
export function PasswordField({
  id, label, value, onChange, autoComplete, placeholder = '••••••••', invalid, describedBy, minLength, required = true, autoFocus,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password'; placeholder?: string; invalid?: boolean; describedBy?: string; minLength?: number; required?: boolean; autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const capsId = useId();
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          maxLength={128}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCaps(false)}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, caps ? capsId : null].filter(Boolean).join(' ') || undefined}
          className={`${base} ${invalid ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'}`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          aria-controls={id}
          title={shown ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--ejo-radius-md)] text-[var(--ejo-text-muted)] transition-colors hover:text-[var(--ejo-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ejo-primary)]/40"
        >
          {shown ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
      {caps ? <p id={capsId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--ejo-warning)]" role="status">⇪ Caps Lock is on</p> : null}
    </div>
  );
}

/** A plain-language strength guide for a NEW password (never sent anywhere). */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; tips: string[] } {
  const tips: string[] = [];
  if (pw.length < 8) tips.push('At least 8 characters');
  if (pw.length < 12) tips.push('12 or more characters is stronger');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) tips.push('Mix capital and small letters');
  if (!/\d/.test(pw)) tips.push('Add a number');
  if (!/[^A-Za-z0-9]/.test(pw)) tips.push('Add a symbol');
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwerty|letmein|welcome)/i.test(pw)) tips.unshift('Avoid common or repeated passwords');
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length < 8 || /^(password|12345678|qwerty)/i.test(pw)) score = Math.min(score, 1);
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][s]!, tips: tips.slice(0, 3) };
}

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, tips } = passwordStrength(password);
  const colour = score <= 1 ? 'var(--ejo-error)' : score === 2 ? 'var(--ejo-warning)' : 'var(--ejo-success)';
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i <= score ? colour : 'var(--ejo-border)' }} />)}
      </div>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]"><span className="font-semibold" style={{ color: colour }}>{label}</span>{tips.length ? ` — ${tips.join(' · ')}` : ''}</p>
    </div>
  );
}
