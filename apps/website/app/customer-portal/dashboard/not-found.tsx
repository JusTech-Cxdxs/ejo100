import Link from 'next/link';
import { Icon } from '@/components/customer/Icon';

/** Shown for a record that doesn't exist — or isn't this customer's. */
export default function PortalNotFound() {
  return (
    <div className="ejo-rise mx-auto max-w-md rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="search" size={22} /></span>
      <h1 className="mt-4 text-lg font-semibold text-[var(--ejo-text)]">We couldn’t find that</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">It may have moved, or it isn’t on your account.</p>
      <Link href="/customer-portal/dashboard" className="mt-5 inline-flex rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white">Back to overview</Link>
    </div>
  );
}
