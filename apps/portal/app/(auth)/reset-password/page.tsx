'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { portalConfig } from '@/lib/site-config';
import { AuthShell } from '@/components/AuthShell';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is invalid or has expired. Please request a new one.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword, token });
    setLoading(false);

    if (resetError) {
      setError(resetError.message ?? 'Could not reset your password. Please request a new link.');
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push('/login'), 2000);
  }

  return (
    <AuthShell
      eyebrow={portalConfig.poweredBy}
      title="Set a new password"
      footer={
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]"
        >
          Back to sign in
        </Link>
      }
    >
      {success ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)]/10 px-3 py-3 text-center text-sm text-[var(--ejo-success)]"
        >
          Password updated. Redirecting you to sign in…
        </motion.p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
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
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
