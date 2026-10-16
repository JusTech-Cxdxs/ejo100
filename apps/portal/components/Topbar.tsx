'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { endAssistSession } from '@/lib/actions/assist';
import { LiveStatus } from '@/components/LiveStatus';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Wordmark } from '@/components/Wordmark';

/**
 * The sticky header: menu button and logo (phones/tablets), the master
 * search front and centre, live status, theme, notifications and the
 * person's own menu (profile, theme, sign out).
 */
export function Topbar({ userName, roleName, organisationName, onMenu, menuOpen = false, assisting = false }: { userName: string; roleName: string; organisationName?: string; onMenu?: () => void; menuOpen?: boolean; assisting?: boolean }) {
  const router = useRouter();
  const [account, setAccount] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  async function handleSignOut() {
    setLeaving(true);
    // An assisted session never outlives the assistant's sign-in.
    if (assisting) await endAssistSession().catch(() => undefined);
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  useEffect(() => {
    if (!account) return;
    const outside = (e: MouseEvent) => { if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccount(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccount(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [account]);

  // (No backdrop-filter on the header: it would make the header the containing
  // block of the phone search sheet and menus, which are position: fixed.)
  return (
    <header className="relative z-40 box-content flex h-16 shrink-0 pt-[env(safe-area-inset-top)] items-center gap-2 border-b border-[var(--ejo-border)] bg-[color-mix(in_srgb,var(--ejo-bg)_92%,var(--ejo-primary))] px-3 shadow-[0_1px_0_0_rgba(0,0,0,0.02)] sm:gap-3 sm:px-5">
      {/* Phones and tablets: the menu button and the logo. */}
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text)] transition-colors hover:bg-[var(--ejo-surface)] lg:hidden"
      >
        <Icon name="menu" size={20} />
      </button>
      {/* Phones and tablets: the full wordmark (logo, name, green rule), scaled to fit. */}
      <Link href="/dashboard" className="flex min-w-0 shrink items-center lg:hidden" aria-label={`${organisationName ?? 'Home'}: dashboard`}>
        <Wordmark name={organisationName ?? ''} size="sm" />
      </Link>

      <div className="flex min-w-0 flex-1 justify-end md:justify-center">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <LiveStatus />
        <Link href="/support/help" aria-label="Help centre" title="Help centre — how-tos, Enyo and a person" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--ejo-text-muted)] transition-colors hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-primary)]">
          <Icon name="help" size={19} />
        </Link>
        <span className="hidden sm:inline-flex"><ThemeToggle /></span>
        <NotificationBell />

        <div ref={accountRef} className="relative">
          <button
            type="button"
            onClick={() => setAccount((v) => !v)}
            aria-label="Account menu"
            aria-expanded={account}
            aria-haspopup="true"
            className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors hover:bg-[var(--ejo-surface)] md:pr-2"
          >
            <Avatar name={userName} size={32} />
            <span className="hidden max-w-[11rem] text-left text-sm leading-tight xl:block">
              <span className="block truncate font-medium text-[var(--ejo-text)]">{userName}</span>
              <span className="block truncate text-xs text-[var(--ejo-text-muted)]" title={roleName}>{roleName}</span>
            </span>
            <span className={`hidden text-[var(--ejo-text-muted)] transition-transform md:inline ${account ? 'rotate-180' : ''}`} aria-hidden="true"><Icon name="chevron-down" size={14} /></span>
          </button>
          {account ? (
            <div className="ejo-pop fixed inset-x-2 top-[calc(4rem+env(safe-area-inset-top))] z-50 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-2xl shadow-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72">
              <div className="flex items-center gap-3 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
                <Avatar name={userName} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ejo-text)]">{userName}</p>
                  <p className="truncate text-xs text-[var(--ejo-text-muted)]">{roleName}</p>
                </div>
              </div>
              <div className="p-1.5">
                <Link href="/profile" onClick={() => setAccount(false)} className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                  <span className="text-[var(--ejo-primary)]"><Icon name="user" size={17} /></span>My profile
                </Link>
                <Link href="/notifications" onClick={() => setAccount(false)} className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                  <span className="text-[var(--ejo-primary)]"><Icon name="bell" size={17} /></span>Notification Center
                </Link>
                <Link href="/support/features" onClick={() => setAccount(false)} className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                  <span className="text-[var(--ejo-primary)]"><Icon name="sparkles" size={17} /></span>What I can do here
                </Link>
                <Link href="/support/help" onClick={() => setAccount(false)} className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                  <span className="text-[var(--ejo-primary)]"><Icon name="help" size={17} /></span>Help centre
                </Link>
                <Link href="/roadmap" onClick={() => setAccount(false)} className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">
                  <span className="text-[var(--ejo-primary)]"><Icon name="roadmap" size={17} /></span>What’s coming next
                </Link>
              </div>
              <div className="border-t border-[var(--ejo-border)] px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]">Appearance</p>
                <ThemeToggle variant="segmented" />
              </div>
              {/* Phones and tablets: sign out lives here (desktops have it in the header). */}
              <div className="border-t border-[var(--ejo-border)] p-1.5 lg:hidden">
                <button type="button" onClick={handleSignOut} disabled={leaving} className="flex w-full items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2 text-left text-sm text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/5">
                  <Icon name="logout" size={17} />{leaving ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={leaving}
          aria-label="Sign out"
          title="Sign out"
          className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--ejo-text-muted)] transition-colors hover:bg-[var(--ejo-error)]/8 hover:text-[var(--ejo-error)] lg:inline-flex"
        >
          <Icon name="logout" size={16} />
          <span className="hidden 2xl:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
