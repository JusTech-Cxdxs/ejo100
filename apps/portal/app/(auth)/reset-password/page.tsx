'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthNotice, authButton } from '@/components/AuthNotice';
import { PasswordField, StrengthMeter, passwordStrength } from '@/components/PasswordField';
import { EjoSpinner } from '@/components/EjoSpinner';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

/**
 * Set a new (or first) password from an emailed link. The link's token is
 * checked by the auth service before this page opens; an expired or used
 * link arrives here as ?error=INVALID_TOKEN and gets a clear way forward.
 */
function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const linkBroken = !token || params.get('error') === 'INVALID_TOKEN';

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
      const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
      if (resetError) {
        const code = (resetError as { code?: string }).code ?? '';
        setError(/INVALID_TOKEN|EXPIRED/i.test(code) || resetError.status === 400
          ? 'This link has expired or was already used. Ask for a new one below.'
          : resetError.status === 429 ? 'Too many attempts. Wait a few minutes, then try again.'
          : 'Could not set your password. Please try again.');
        setState('idle');
        return;
      }
      setState('done');
      setTimeout(() => router.replace('/login?reset=done'), 1200);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setState('idle');
    }
  }

  if (linkBroken) {
    return (
      <AuthShell title="This link can’t be used" footer={<Link href="/login" className="block text-center text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">← Back to sign in</Link>}>
        <div className="space-y-5">
          <AuthNotice kind="error">The link has expired or was already used. Links to set a password work once — 1 hour for “forgot password”, 72 hours for a welcome email.</AuthNotice>
          <Link href="/forgot-password" className={authButton}>Send me a new link</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set your password"
      subtitle="Choose a password only you know. You’ll use it with your work email to sign in."
      footer={<Link href="/login" className="block text-center text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">← Back to sign in</Link>}
    >
      {state === 'done' ? (
        <AuthNotice kind="success">Your password is set. Taking you to sign in…</AuthNotice>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          {/* Lets password managers save the new password against the right account. */}
          <input type="text" name="username" autoComplete="username" className="hidden" aria-hidden="true" tabIndex={-1} readOnly />
          <div>
            <PasswordField id="newPassword" label="New password" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} autoFocus describedBy="pw-rules" />
            <StrengthMeter password={password} />
            {!password ? <p id="pw-rules" className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">At least 8 characters. Longer is stronger — a short sentence works well.</p> : null}
          </div>
          <PasswordField id="confirmPassword" label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(confirm) && confirm !== password} />
          {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
          <button type="submit" disabled={state !== 'idle'} className={authButton}>
            {state === 'working' ? <EjoSpinner /> : null}
            {state === 'working' ? 'Saving…' : 'Set password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
