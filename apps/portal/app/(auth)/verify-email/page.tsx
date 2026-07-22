import Link from 'next/link';
import { portalConfig } from '@/lib/site-config';
import { AuthShell } from '@/components/AuthShell';

/**
 * Informational landing page shown right after signup. The actual
 * verification link in the email points at Better Auth's own
 * /api/auth/verify-email endpoint (see lib/auth.ts's
 * emailVerification.sendVerificationEmail) — this page never handles a
 * token itself.
 */
export default function VerifyEmailPage() {
  return (
    <AuthShell
      eyebrow={portalConfig.poweredBy}
      title="Check your email"
      subtitle="We've sent a verification link to your email address. Click it to activate your account."
      footer={
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-[var(--ejo-primary)] hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-3xl">
          ✉️
        </div>
      </div>
    </AuthShell>
  );
}
