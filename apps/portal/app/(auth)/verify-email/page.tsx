import Link from 'next/link';
import { portalConfig } from '@/lib/site-config';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/ui/Icon';

/**
 * Shown after sign-up. The emailed link goes to Better Auth's
 * /api/auth/verify-email (see lib/auth.ts); this page never handles a token.
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
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]">
          <Icon name="mail" size={28} />
        </div>
      </div>
    </AuthShell>
  );
}
