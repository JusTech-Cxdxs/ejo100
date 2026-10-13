'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/authz/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Marquee } from './Marquee';
import { NavigationLoadingProvider } from './NavigationLoadingProvider';
import { CONTENT_AREA_ID } from './content-area';

export const SIDEBAR_COOKIE = 'ejo-sidebar';

/**
 * The frame around every signed-in page: the menu on the left (sticky, full
 * height; folds to icons on desktops; a slide-in drawer on phones and
 * tablets), the header on top (sticky, glassy), the scrolling bar, and the
 * working area — the only part that scrolls.
 */
export function AppShell({
  items,
  organisationName,
  userName,
  roleName,
  initialCollapsed,
  banner,
  children,
}: {
  items: NavItem[];
  organisationName: string;
  userName: string;
  roleName: string;
  initialCollapsed: boolean;
  /** Shown under the header on every page (the assisted-session banner). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'open'}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      return next;
    });
  }, []);

  const openDrawer = useCallback(() => { opener.current = document.activeElement as HTMLElement | null; setDrawer(true); }, []);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  // Closes on navigation.
  useEffect(() => { setDrawer(false); }, [pathname]);

  // Drawer: Esc closes, Tab stays inside, the page behind does not scroll; focus returns to the menu button.
  useEffect(() => {
    if (!drawer) return;
    const el = drawerRef.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') ?? []).filter((n) => n.offsetParent !== null);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setDrawer(false); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener.current?.focus?.();
    };
  }, [drawer]);

  // A desktop-sized window never keeps the drawer open.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => { if (mq.matches) setDrawer(false); };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--ejo-bg)]">
      <a href="#main" className="sr-only z-[70] rounded-md bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to the page</a>

      {/* Desktop: always there, sticky, full height. */}
      <div className="hidden h-full shrink-0 lg:block">
        <Sidebar items={items} organisationName={organisationName} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </div>

      {/* Phones and tablets: the slide-in drawer. */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="ejo-fade absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={closeDrawer} aria-hidden="true" />
          <div ref={drawerRef} className="ejo-slide-in absolute inset-y-0 left-0 max-w-[86vw] shadow-2xl">
            <Sidebar items={items} organisationName={organisationName} variant="drawer" onNavigate={closeDrawer} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar userName={userName} roleName={roleName} organisationName={organisationName} onMenu={openDrawer} menuOpen={drawer} assisting={Boolean(banner)} />
        {banner}
        <Marquee />
        {/* The working area. Loading and saving overlays cover only this box
            (see CONTENT_AREA_ID), so the menu, header and ticker never disappear. */}
        <div id={CONTENT_AREA_ID} className="relative flex min-h-0 min-w-0 flex-1">
          <main id="main" tabIndex={-1} className="ejo-scroll flex min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[var(--ejo-bg)] focus:outline-none">
            <NavigationLoadingProvider>{children}</NavigationLoadingProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
