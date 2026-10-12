'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { customerAuthClient } from '@/lib/auth-customer-client';
import { CustomerAuthShell } from '@/components/customer/CustomerAuthShell';
import { AuthNotice, authButton, authInput } from '@/components/customer/AuthNotice';
import { PasswordField } from '@/components/customer/PasswordField';
import { Spinner } from '@/components/Spinner';
import { safeRedirect } from '@/lib/customer-portal/redirect';

export default function CustomerPortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <CustomerLoginForm />
    </Suspense>
  );
}

const INACTIVE = 'This account is switched off. Please contact your branch and we’ll help you straight away.';
const ARRIVAL: Record<string, { kind: 'error' | 'success' | 'info'; text: string }> = {
  inactive: { kind: 'error', text: INACTIVE },
  expired: { kind: 'info', text: 'Your session ended. Please sign in again.' },
  signed_out: { kind: 'info', text: 'You’re signed out. See you soon!' },
};

/** Plain words for every way signing in can fail — never a raw server message. */
function explain(err: { status?: number; code?: string; message?: string }): string {
  const code = err.code ?? '';
  if (err.status === 429) return 'Too many sign-in attempts. Please wait a minute, then try again.';
  if (/SESSION|BANNED|INACTIVE/i.test(code)) return INACTIVE;
  if (/INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|USER_NOT_FOUND|CREDENTIAL/i.test(code) || err.status === 401) {
    return 'That email and password don’t match. Check both and try again — or reset your password.';
  }
  if (/INVALID_EMAIL/i.test(code)) return 'Enter a valid email address.';
  if ((err.status ?? 0) >= 500) return 'We’re having a problem signing you in right now. Please try again in a moment.';
  return 'We couldn’t sign you in. Please try again.';
}

function CustomerLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only ever return to a page on THIS site's customer area — never an
  // outside address (blocks "…?redirect=https://fake-site" phishing links).
  const redirectTo = safeRedirect(params.get('redirect'));
  const arrival = params.get('reset') === 'done'
    ? { kind: 'success' as const, text: 'Your new password is set. Sign in with it now.' }
    : ARRIVAL[params.get('error') ?? params.get('status') ?? ''];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'success'>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (state !== 'idle') return;
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setState('working');
    try {
      const { error: signInError } = await customerAuthClient.signIn.email({ email: cleanEmail, password, rememberMe });
      if (signInError) {
        setError(explain(signInError as { status?: number; code?: string; message?: string }));
        setState('idle');
        return;
      }
      setState('success');
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError('We couldn’t reach the server. Check your internet connection and try again.');
      setState('idle');
    }
  }

  return (
    <CustomerAuthShell title="Welcome back" subtitle="Sign in to follow your vehicle’s service, estimates and payments.">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate data-testid="customer-sign-in-form">
        {arrival && !error && state === 'idle' ? <AuthNotice kind={arrival.kind}>{arrival.text}</AuthNotice> : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            required
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(error) || undefined}
            className={authInput}
          />
        </div>
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={Boolean(error)} />

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-[var(--ejo-text)]">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-[var(--ejo-border)] bg-[var(--ejo-bg)] transition-colors checked:border-[var(--ejo-primary)] checked:bg-[var(--ejo-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ejo-primary)]/40"
              />
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 text-white peer-checked:block" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
            </span>
            Remember me
          </label>
          <Link href="/customer-portal/forgot-password" className="font-medium text-[var(--ejo-primary)] hover:underline">Forgot password?</Link>
        </div>

        {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
        {state === 'success' ? <AuthNotice kind="success">Signed in — opening your dashboard…</AuthNotice> : null}

        <button type="submit" disabled={state !== 'idle'} className={authButton}>
          {state !== 'idle' ? <Spinner /> : null}
          {state === 'working' ? 'Signing in…' : state === 'success' ? 'Opening…' : 'Sign in'}
        </button>
        <p className="text-center text-xs leading-relaxed text-[var(--ejo-text-muted)]">
          New here? Your account is opened at the workshop front desk — check your email for the welcome message with a link to set your password.
        </p>
      </form>
    </CustomerAuthShell>
  );
}
