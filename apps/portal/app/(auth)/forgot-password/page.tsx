'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { authClient } from '@/lib/auth-client';
import { portalConfig } from '@/lib/site-config';
import { AuthShell } from '@/components/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: reqError } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });

    setLoading(false);

    if (reqError) {
      setError(reqError.message ?? 'Something went wrong. Please try again.');
      return;
    }

    setSent(true);
  }

  return (
    <AuthShell
      eyebrow={portalConfig.poweredBy}
      title="Forgot your password?"
      subtitle="Enter your work email and we'll send you a reset link."
      footer={
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]"
        >
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)]/10 px-3 py-3 text-center text-sm text-[var(--ejo-success)]"
        >
          If an account exists for that email, a reset link is on its way.
        </motion.p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@kewalram.com"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-3 text-sm text-[var(--ejo-text)] outline-none focus:border-[var(--ejo-primary)] focus:ring-2 focus:ring-[var(--ejo-primary)]/20"
            />
          </div>

          {error && (
            <p className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)]/10 px-3 py-2.5 text-sm text-[var(--ejo-error)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--ejo-primary)] py-3 text-sm font-semibold text-white shadow-sm transition-all hover:scale-[1.01] hover:opacity-90 disabled:scale-100 disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
