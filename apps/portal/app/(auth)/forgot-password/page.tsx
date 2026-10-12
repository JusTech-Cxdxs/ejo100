'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { AuthShell } from '@/components/AuthShell';
import { AuthNotice, authButton, authInput } from '@/components/AuthNotice';
import { EjoSpinner } from '@/components/EjoSpinner';

/**
 * Ask for a set-password link. The answer is always the same ("if an account
 * exists…") — this page never reveals whether an email has an account.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Enter a valid work email address.'); return; }
    setLoading(true);
    try {
      const { error: reqError } = await authClient.requestPasswordReset({ email: clean, redirectTo: '/reset-password' });
      if (reqError && reqError.status === 429) { setError('Too many requests. Wait a few minutes, then try again.'); return; }
      // Any other answer reads the same, so nobody can test which emails have accounts.
      setSentTo(clean);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={sentTo ? 'Check your email' : 'Reset your password'}
      subtitle={sentTo ? undefined : 'Enter your work email and we’ll send you a link to set a new password.'}
      footer={<Link href="/login" className="block text-center text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">← Back to sign in</Link>}
    >
      {sentTo ? (
        <div className="space-y-4">
          <AuthNotice kind="success">
            If an account exists for <strong className="break-all">{sentTo}</strong>, a link to set a new password is on its way. It works once and expires in 1 hour.
          </AuthNotice>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ejo-text-muted)]">
            <li>Check your spam or junk folder.</li>
            <li>Nothing after 10 minutes? Try again, or ask your administrator to send your welcome email again.</li>
          </ul>
          <button type="button" onClick={() => { setSentTo(null); setEmail(''); }} className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">Use a different email</button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">Work email</label>
            <input id="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="off" spellCheck={false} required maxLength={200} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-invalid={Boolean(error) || undefined} className={authInput} />
          </div>
          {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
          <button type="submit" disabled={loading} className={authButton}>
            {loading ? <EjoSpinner /> : null}
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
