'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { customerAuthClient } from '@/lib/auth-customer-client';
import { CustomerAuthShell } from '@/components/customer/CustomerAuthShell';
import { AuthNotice, authButton } from '@/components/customer/AuthNotice';
import { PasswordField, StrengthMeter, passwordStrength } from '@/components/customer/PasswordField';
import { Spinner } from '@/components/Spinner';
import { Icon } from '@/components/customer/Icon';

export default function CustomerResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

const backLink = (
  <Link href="/customer-portal" className="flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">
    <Icon name="arrowLeft" size={15} /> Back to sign in
  </Link>
);

/**
 * Set a new (or first) password from an emailed link —
 * /customer-portal/reset-password?token=… (contract 1: welcome links last
 * 72 hours, "forgot password" links 1 hour). A missing, expired or used
 * token gets a clear way forward instead of a dead end.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [expired, setExpired] = useState(!token || params.get('error') === 'INVALID_TOKEN');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (state !== 'idle') return;
    setError(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (passwordStrength(password).score < 2) { setError('Choose a stronger password — longer, with a mix of letters, numbers and a symbol.'); return; }
    if (password !== confirm) { setError('The two passwords don’t match.'); return; }
    setState('working');
    try {
      const { error: resetError } = await customerAuthClient.resetPassword({ newPassword: password, token });
      if (resetError) {
        const code = (resetError as { code?: string }).code ?? '';
        if (/INVALID_TOKEN|EXPIRED/i.test(code)) { setExpired(true); setState('idle'); return; }
        setError(resetError.status === 429 ? 'Too many attempts. Please wait a few minutes, then try again.'
          : /PASSWORD_TOO_SHORT/i.test(code) ? 'Use at least 8 characters.'
          : /PASSWORD_TOO_LONG/i.test(code) ? 'That password is too long — 128 characters at most.'
          : 'We couldn’t set your password. Please try again.');
        setState('idle');
        return;
      }
      setState('done');
      setTimeout(() => router.replace('/customer-portal?reset=done'), 1200);
    } catch {
      setError('We couldn’t reach the server. Check your internet connection and try again.');
      setState('idle');
    }
  }

  if (expired) {
    return (
      <CustomerAuthShell title="This link can’t be used" subtitle="It has expired or was already used — it happens. Ask for a fresh one below." footer={backLink}>
        <div className="space-y-5" data-testid="reset-link-expired">
          <AuthNotice kind="error">Links to set a password work once — 1 hour for “forgot password”, 72 hours for a welcome email.</AuthNotice>
          <Link href="/customer-portal/forgot-password" className={authButton}>Send me a new link</Link>
        </div>
      </CustomerAuthShell>
    );
  }

  return (
    <CustomerAuthShell title="Set your password" subtitle="Choose a password only you know. You’ll use it with your email to sign in." footer={backLink}>
      {state === 'done' ? (
        <AuthNotice kind="success">Your password is set. Taking you to sign in…</AuthNotice>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          {/* Lets password managers save the new password against the right account. */}
          <input type="text" name="username" autoComplete="username" className="hidden" aria-hidden="true" tabIndex={-1} readOnly />
          <div>
            <PasswordField id="newPassword" label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} describedBy="pw-rules" />
            <StrengthMeter password={password} />
            {!password ? <p id="pw-rules" className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">At least 8 characters. Longer is stronger — a short sentence works well.</p> : null}
          </div>
          <PasswordField id="confirmPassword" label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(confirm) && confirm !== password} />
          {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
          <button type="submit" disabled={state !== 'idle'} className={authButton}>
            {state === 'working' ? <Spinner /> : null}
            {state === 'working' ? 'Saving…' : 'Set password'}
          </button>
        </form>
      )}
    </CustomerAuthShell>
  );
}
