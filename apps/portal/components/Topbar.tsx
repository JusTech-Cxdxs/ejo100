'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function Topbar() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-6">
      <input
        type="search"
        placeholder="Search anything..."
        className="w-80 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-2 text-sm outline-none focus:border-[var(--ejo-primary)]"
      />
      <div className="flex items-center gap-4">
        <button aria-label="Notifications" className="text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
          🔔
        </button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[var(--ejo-primary)]/20" />
          <div className="text-sm">
            <p className="font-medium text-[var(--ejo-text)]">John Doe</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">Administrator</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          className="text-xs font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-error)]"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
