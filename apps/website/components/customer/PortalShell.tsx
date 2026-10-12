'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { siteConfig } from '@/lib/site-config';
import { customerAuthClient } from '@/lib/auth-customer-client';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';
import { ThemeSwitch } from './ThemeSwitch';
import { NotificationBell } from './NotificationBell';
import { Icon, type IconName } from './Icon';

const BASE = '/customer-portal/dashboard';

export const NAV: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: BASE, label: 'Overview', icon: 'home', exact: true },
  { href: `${BASE}/vehicles`, label: 'My vehicles', icon: 'car' },
  { href: `${BASE}/services`, label: 'My services', icon: 'wrench' },
  { href: `${BASE}/payments`, label: 'Payments', icon: 'wallet' },
  { href: `${BASE}/warranties`, label: 'Warranties', icon: 'shield' },
  { href: `${BASE}/notifications`, label: 'Notifications', icon: 'bell' },
  { href: `${BASE}/profile`, label: 'Profile & settings', icon: 'user' },
  { href: `${BASE}/support`, label: 'Help & support', icon: 'help' },
];

const QUICK: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: BASE, label: 'Home', icon: 'home', exact: true },
  { href: `${BASE}/services`, label: 'Services', icon: 'wrench' },
  { href: `${BASE}/payments`, label: 'Payments', icon: 'wallet' },
  { href: `${BASE}/notifications`, label: 'Alerts', icon: 'bell' },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

type Who = { fullName: string; firstName: string; email: string; initials: string; greeting: string };

/**
 * The signed-in customer's frame: a calm sidebar on desktop; on phones a
 * top bar with a menu button that slides in the same navigation as a
 * drawer (focus stays inside it, Esc or a tap outside closes it, and it
 * closes itself on navigation), plus a thumb-friendly quick bar at the
 * bottom. The sticky header carries the greeting, the notification bell,
 * the theme switch and the account menu.
 */
export function PortalShell({ who, initialUnread, children }: { who: Who; initialUnread: number; children: ReactNode }) {
  const pathname = usePathname() ?? BASE;
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [signingOut, setSigningOut] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close the drawer whenever the page changes.
  useEffect(() => { setDrawer(false); }, [pathname]);

  // Focus trap + Esc + scroll lock while the drawer is open.
  useEffect(() => {
    if (!drawer) return;
    const panel = drawerRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setDrawer(false); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const trigger = menuButton.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      trigger?.focus();
    };
  }, [drawer]);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await customerAuthClient.signOut(); } catch { /* the page below clears it anyway */ }
    router.replace('/customer-portal?error=signed_out');
    router.refresh();
  }, [router, signingOut]);

  const navList = (onDark = false) => (
    <ul className="space-y-1">
      {NAV.map((n) => {
        const active = isActive(pathname, n.href, n.exact);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-[var(--ejo-radius-md)] px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'
                  : onDark
                    ? 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]'
                    : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${active ? 'bg-[var(--ejo-primary)] text-white shadow-sm' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] ring-1 ring-[var(--ejo-border)] group-hover:text-[var(--ejo-primary)]'}`}>
                <Icon name={n.icon} size={16} />
              </span>
              <span className="flex-1">{n.label}</span>
              {n.icon === 'bell' && unread > 0 ? <span className="rounded-full bg-[var(--ejo-primary)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{unread > 99 ? '99+' : unread}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-[100dvh] bg-[var(--ejo-bg)] lg:flex">
      <a href="#portal-main" className="sr-only z-[60] rounded bg-[var(--ejo-primary)] px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>

      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-[100dvh] w-[268px] shrink-0 flex-col border-r border-[var(--ejo-border)] bg-[var(--ejo-surface)] lg:flex" aria-label="Customer portal">
        <div className="px-5 pb-4 pt-6">
          <Link href={BASE} aria-label="Overview"><Wordmark name={siteConfig.companyShortName} /></Link>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--ejo-primary)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ejo-primary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ejo-primary)]" />Customer portal
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">{navList()}</nav>
        <div className="space-y-4 border-t border-[var(--ejo-border)] px-5 py-4">
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-[var(--ejo-radius-md)] px-1 py-1 text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-error)]">
            <Icon name="logout" size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <PoweredByEjo />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--ejo-bg)]/75">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              aria-expanded={drawer}
              aria-controls="portal-drawer"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text)] lg:hidden"
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--ejo-text)] sm:text-base">{who.greeting}, {who.firstName}</p>
              <p className="hidden truncate text-xs text-[var(--ejo-text-muted)] sm:block">{siteConfig.companyShortName} · Customer portal</p>
            </div>
            <NotificationBell initialUnread={initialUnread} onUnreadChange={setUnread} />
            <div className="hidden sm:block"><ThemeSwitch /></div>
            <AccountMenu who={who} onSignOut={signOut} signingOut={signingOut} />
          </div>
        </header>

        <main id="portal-main" className="flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Quick bar — phones */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--ejo-border)] bg-[var(--ejo-bg)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick links">
        <ul className="grid grid-cols-5">
          {QUICK.map((q) => {
            const active = isActive(pathname, q.href, q.exact);
            return (
              <li key={q.href}>
                <Link href={q.href} aria-current={active ? 'page' : undefined} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? 'text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)]'}`}>
                  {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--ejo-primary)]" aria-hidden="true" /> : null}
                  <span className="relative">
                    <Icon name={q.icon} size={20} />
                    {q.icon === 'bell' && unread > 0 ? <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--ejo-bg)] bg-[var(--ejo-primary)]" aria-label={`${unread} unread`} /> : null}
                  </span>
                  {q.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setDrawer(true)} className="flex w-full flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-[var(--ejo-text-muted)]" aria-label="More — open menu">
              <Icon name="menu" size={20} />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Drawer — phones and tablets */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" id="portal-drawer">
          <button type="button" className="ejo-fade absolute inset-0 h-full w-full cursor-default bg-slate-950/50 backdrop-blur-[2px]" aria-label="Close menu" tabIndex={-1} onClick={() => setDrawer(false)} />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu" className="ejo-slide-in absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-[var(--ejo-bg)] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ejo-border)] px-4 py-4">
              <Wordmark name={siteConfig.companyShortName} />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text)]">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ejo-accent)] to-[var(--ejo-primary-dark)] text-sm font-bold text-white">{who.initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ejo-text)]">{who.fullName}</p>
                <p className="truncate text-xs text-[var(--ejo-text-muted)]">{who.email}</p>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-3" aria-label="Main">{navList(true)}</nav>
            <div className="space-y-4 border-t border-[var(--ejo-border)] px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--ejo-text-muted)]">Appearance</span>
                <ThemeSwitch />
              </div>
              <button type="button" onClick={() => void signOut()} className="flex w-full items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-error)]/40 hover:text-[var(--ejo-error)]">
                <Icon name="logout" size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
              <PoweredByEjo />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({ who, onSignOut, signingOut }: { who: Who; onSignOut: () => void; signingOut: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={wrap}>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        className="flex items-center gap-2 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ejo-primary)]/40 sm:pr-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ejo-accent)] to-[var(--ejo-primary-dark)] text-xs font-bold text-white shadow-sm">{who.initials}</span>
        <span className="hidden text-[var(--ejo-text-muted)] sm:inline-flex"><Icon name="chevronDown" size={16} /></span>
      </button>
      {open ? (
        <div role="menu" className="ejo-pop absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] shadow-2xl">
          <div className="border-b border-[var(--ejo-border)] px-4 py-3">
            <p className="truncate text-sm font-semibold text-[var(--ejo-text)]">{who.fullName}</p>
            <p className="truncate text-xs text-[var(--ejo-text-muted)]">{who.email}</p>
          </div>
          <Link role="menuitem" href={`${BASE}/profile`} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"><Icon name="user" size={16} /> Profile & settings</Link>
          <Link role="menuitem" href={`${BASE}/support`} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"><Icon name="help" size={16} /> Help & support</Link>
          <button role="menuitem" type="button" onClick={onSignOut} className="flex w-full items-center gap-2.5 border-t border-[var(--ejo-border)] px-4 py-2.5 text-left text-sm text-[var(--ejo-error)] hover:bg-[var(--ejo-surface)]">
            <Icon name="logout" size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
