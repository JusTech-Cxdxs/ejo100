'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { customerAuthClient } from '@/lib/auth-customer-client';
import { CustomerAuthShell } from '@/components/customer/CustomerAuthShell';
import { AuthNotice, authButton, authInput } from '@/components/customer/AuthNotice';
import { Spinner } from '@/components/Spinner';
import { Icon } from '@/components/customer/Icon';

const backLink = (
  <Link href="/customer-portal" className="flex items-center justify-center gap-1.5 text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">
    <Icon name="arrowLeft" size={15} /> Back to sign in
  </Link>
);

/**
 * Ask for a link to set a new password. The answer is always the same
 * ("if an account exists…") — this page never reveals whether an email
 * belongs to a customer.
 */
export default function CustomerForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Enter a valid email address.'); return; }
    setLoading(true);
    try {
      const { error: reqError } = await customerAuthClient.requestPasswordReset({ email: clean });
      if (reqError && reqError.status === 429) { setError('Too many requests. Please wait a few minutes, then try again.'); return; }
      // Any other answer reads the same, so nobody can test which emails have accounts.
      setSentTo(clean);
    } catch {
      setError('We couldn’t reach the server. Check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <CustomerAuthShell
      title={sentTo ? 'Check your email' : 'Forgot your password?'}
      subtitle={sentTo ? undefined : 'No problem. Enter the email you gave us at the workshop and we’ll send you a link to set a new one.'}
      footer={backLink}
    >
      {sentTo ? (
        <div className="space-y-4">
          <div className="ejo-rise flex justify-center" aria-hidden="true">
            <span className="relative flex h-16 w-16 items-center justify-center">
              <span className="ejo-glow absolute inset-0 rounded-full bg-[var(--ejo-primary)]/30 blur-md" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="mail" size={26} /></span>
            </span>
          </div>
          <AuthNotice kind="success">
            If an account exists for <strong className="break-all">{sentTo}</strong>, a link to set a new password is on its way. It works once and expires in 1 hour.
          </AuthNotice>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ejo-text-muted)]">
            <li>Check your spam or junk folder.</li>
            <li>Nothing after 10 minutes? Try again, or call your branch and we’ll send it for you.</li>
          </ul>
          <button type="button" onClick={() => { setSentTo(null); setEmail(''); }} className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">Use a different email</button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">Email</label>
            <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="off" spellCheck={false} required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={Boolean(error) || undefined} className={authInput} />
          </div>
          {error ? <AuthNotice kind="error">{error}</AuthNotice> : null}
          <button type="submit" disabled={loading} className={authButton}>
            {loading ? <Spinner /> : null}
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </CustomerAuthShell>
  );
}
