'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { customerAuthClient } from '@/lib/auth-customer-client';
import { siteConfig } from '@/lib/site-config';

export default function CustomerPortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <CustomerLoginForm />
    </Suspense>
  );
}

function CustomerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/customer-portal/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await customerAuthClient.signIn.email({ email, password });

    setLoading(false);

    if (signInError) {
      setError(signInError.message ?? 'Invalid email or password.');
      return;
    }

    router.push(redirectTo);
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6 pt-32 pb-24">
      <h1 className="text-center text-2xl font-bold text-[var(--ejo-text)]">Customer Portal</h1>
      <p className="mb-8 text-center text-sm text-[var(--ejo-text-muted)]">
        Sign in to track your vehicle, orders and invoices with {siteConfig.companyName}.
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--ejo-text)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--ejo-primary)]"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--ejo-text)]">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--ejo-primary)]"
          />
        </div>

        {error && (
          <p className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)]/10 px-3 py-2 text-sm text-[var(--ejo-error)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </main>
  );
}
