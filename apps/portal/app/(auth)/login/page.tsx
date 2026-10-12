'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthNotice, authButton, authInput } from '@/components/AuthNotice';
import { PasswordField } from '@/components/PasswordField';
import { EjoSpinner } from '@/components/EjoSpinner';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

const INACTIVE = 'This account has been switched off. Ask your administrator to switch it back on.';
const ARRIVAL: Record<string, { kind: 'error' | 'success' | 'info'; text: string }> = {
  inactive: { kind: 'error', text: INACTIVE },
  signed_out: { kind: 'info', text: 'Your session ended. Please sign in again.' },
};

/** Plain words for every way signing in can fail — never a raw server message. */
function explain(err: { status?: number; code?: string; message?: string }): string {
  const code = err.code ?? '';
  if (err.status === 429) return 'Too many sign-in attempts. Wait a minute, then try again.';
  if (/SESSION|BANNED|INACTIVE/i.test(code) || /session/i.test(err.message ?? '')) return INACTIVE;
  if (/INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|USER_NOT_FOUND|CREDENTIAL/i.test(code) || err.status === 401) {
    return 'That email and password don’t match. Check both and try again — or reset your password.';
  }
  if (/INVALID_EMAIL/i.test(code)) return 'Enter a valid work email address.';
  if ((err.status ?? 0) >= 500) return 'The sign-in service is having a problem right now. Please try again in a moment.';
  return 'Could not sign you in. Please try again.';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only ever return to a page on THIS site — never an outside address
  // (blocks "…/login?redirect=https://fake-site" phishing links).
  const requested = params.get('redirect') ?? '';
  const redirectTo = /^\/(?![/\\])/.test(requested) ? requested : '/dashboard';
  const arrival = params.get('reset') === 'done'
    ? { kind: 'success' as const, text: 'Your password is set. Sign in with it now.' }
    : ARRIVAL[params.get('error') ?? ''];

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Enter a valid work email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setState('working');
    try {
      const { error: signInError } = await authClient.signIn.email({ email: cleanEmail, password, rememberMe });
      if (signInError) {
        setError(explain(signInError as { status?: number; code?: string; message?: string }));
        setState('idle');
        return;
      }
      setState('success');
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setState('idle');
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your staff account to continue.">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {arrival && !error && state === 'idle' ? <AuthNotice kind={arrival.kind}>{arrival.text}</AuthNotice> : null}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">Work email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            required
            maxLength={200}
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            aria-invalid={Boolean(error) || undefined}
            className={authInput}
          />
        </div>
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={Boolean(error)} />

        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[var(--ejo-text-muted)]">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded" />
            Keep me signed in
          </label>
          <Link href="/forgot-password" className="font-medium text-[var(--ejo-primary)] hover:underline">Forgot password?</Link>
        </div>

        {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
        {state === 'success' ? <AuthNotice kind="success">Signed in — opening your dashboard…</AuthNotice> : null}

        <button type="submit" disabled={state !== 'idle'} className={authButton}>
          {state !== 'idle' ? <EjoSpinner /> : null}
          {state === 'working' ? 'Signing in…' : state === 'success' ? 'Opening…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-[var(--ejo-text-muted)]">New here? Your administrator creates your account — check your email for the welcome message.</p>
      </form>
    </AuthShell>
  );
}
