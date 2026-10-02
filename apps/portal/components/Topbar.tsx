'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { LiveStatus } from '@/components/LiveStatus';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationBell } from '@/components/NotificationBell';

export function Topbar({ userName, roleName }: { userName: string; roleName: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-6">
      <GlobalSearch />
      <div className="flex items-center gap-4">
        <LiveStatus />
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[var(--ejo-primary)]/20" />
          <div className="text-sm">
            <p className="font-medium text-[var(--ejo-text)]">{userName}</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">{roleName}</p>
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
