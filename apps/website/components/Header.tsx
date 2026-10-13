'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { siteNav, siteConfig, getPortalLoginUrl } from '@/lib/site-config';
import { useI18n } from '@/lib/i18n';
import { SiteWordmark } from './SiteWordmark';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelector } from './LanguageSelector';
import { SearchModal } from './SearchModal';

export function Header() {
  const { t } = useI18n();
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const portalLogin = getPortalLoginUrl();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The phone menu closes on navigation and on Esc, and the page behind it
  // does not scroll while it is open.
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [mobileOpen]);

  // Transparent-on-hero only makes sense on the homepage, over the hero
  // image — every other page has a plain background, so it gets the solid
  // header immediately (white text on white would otherwise be illegible).
  const transparent = isHome && !scrolled;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50">
        {/* ---- Top bar row — always visible on desktop; background
             switches between a translucent tint (over the hero) and the
             solid brand green once the main row goes solid. ---- */}
        <div
          className={`hidden transition-colors duration-300 lg:block ${
            transparent ? 'bg-black/15' : 'bg-[var(--ejo-primary)]'
          }`}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-xs">
            <p className="font-medium text-white/90">{t('header.tagline')}</p>
            <div className="flex items-center gap-1">
              <LanguageSelector dark />
              <SearchModal dark />
              <ThemeToggle dark />
            </div>
          </div>
        </div>

        {/* ---- Main header row ---- */}
        <div
          className="transition-all duration-300"
          style={
            transparent
              ? { background: 'transparent' }
              : { background: 'var(--ejo-bg)', borderBottom: '1px solid var(--ejo-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }
          }
        >
          <div className="mx-auto flex max-w-7xl flex-nowrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label={siteConfig.organisationName}>
              <SiteWordmark tone={transparent ? 'light' : 'default'} />
            </Link>

            <nav className="hidden shrink-0 items-center gap-4 whitespace-nowrap xl:ml-3 xl:flex 2xl:gap-6">
              {siteNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <div key={item.href} className="group relative shrink-0">
                    <Link
                      href={item.href}
                      className={`relative whitespace-nowrap pb-1 text-sm font-medium transition-colors ${
                        transparent ? 'text-white/90 hover:text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]'
                      } ${active ? (transparent ? 'text-white' : 'text-[var(--ejo-primary)]') : ''}`}
                    >
                      {t(item.key)}
                      {active && (
                        <span
                          className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full"
                          style={{ background: transparent ? '#fff' : 'var(--ejo-primary)' }}
                        />
                      )}
                    </Link>
                    {item.children && (
                      <div className="invisible absolute left-0 top-full pt-3 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
                        <div className="w-52 overflow-hidden rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-2 shadow-xl">
                          {item.children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className="block px-4 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-primary)]"
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="hidden shrink-0 items-center gap-3 whitespace-nowrap xl:flex">
              <Link
                href="/customer-portal"
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  transparent
                    ? 'border-white/30 text-white hover:bg-white/10'
                    : 'border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'
                }`}
              >
                {t('header.customerLogin')}
              </Link>
              {portalLogin ? (
                <a
                  href={portalLogin}
                  className="shrink-0 whitespace-nowrap rounded-full bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] hover:opacity-90"
                >
                  {t('header.employeeLogin')}
                </a>
              ) : null}
            </div>

            <button
              type="button"
              className={`-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full xl:hidden ${transparent ? 'text-white' : 'text-[var(--ejo-text)]'}`}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile off-canvas menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/60 xl:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="fixed inset-y-0 right-0 z-[120] flex w-80 max-w-[88vw] flex-col bg-[var(--ejo-bg)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl xl:hidden"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <Link href="/" onClick={() => setMobileOpen(false)} className="min-w-0" aria-label={siteConfig.organisationName}>
                  <SiteWordmark />
                </Link>
                <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[var(--ejo-border)] pb-4">
                <LanguageSelector align="left" />
                <SearchModal />
                <ThemeToggle />
              </div>

              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {siteNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-[var(--ejo-radius-md)] px-3 py-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
                  >
                    {t(item.key)}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 space-y-3 border-t border-[var(--ejo-border)] pt-4">
                <Link
                  href="/customer-portal"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center justify-center rounded-full border border-[var(--ejo-border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--ejo-text)]"
                >
                  {t('header.customerLogin')}
                </Link>
                {portalLogin ? (
                  <a
                    href={portalLogin}
                    className="flex min-h-11 items-center justify-center rounded-full bg-[var(--ejo-primary)] px-4 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    {t('header.employeeLogin')}
                  </a>
                ) : null}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

