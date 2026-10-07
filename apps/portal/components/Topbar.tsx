'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { LiveStatus } from '@/components/LiveStatus';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar } from '@/components/Avatar';
import Link from 'next/link';

export function Topbar({ userName, roleName }: { userName: string; roleName: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-6">
      <GlobalSearch />
      <div className="flex shrink-0 items-center gap-3">
        <LiveStatus />
        <ThemeToggle />
        <NotificationBell />
        <Link href="/profile" className="flex items-center gap-2 rounded-full pr-1 hover:opacity-90" title="My profile">
          <Avatar name={userName} size={32} />
          <div className="hidden max-w-[12rem] text-sm md:block">
            <p className="truncate font-medium text-[var(--ejo-text)]">{userName}</p>
            <p className="truncate text-xs text-[var(--ejo-text-muted)]" title={roleName}>{roleName}</p>
          </div>
        </Link>
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          className="whitespace-nowrap text-xs font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-error)]"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
