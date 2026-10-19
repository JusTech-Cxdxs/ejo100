'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { siteNav, siteConfig, getPortalLoginUrl } from '@/lib/site-config';
import { useI18n } from '@/lib/i18n';
import { SiteWordmark } from './SiteWordmark';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelector } from './LanguageSelector';
import { SearchModal } from './SearchModal';

/**
 * The site header. On a phone it is always a solid bar — wordmark, theme
 * toggle and the menu button — so it reads on every page and photo; the
 * menu is a full-height sheet with language, search and the two sign-ins.
 * On a wide screen the home page starts transparent over the hero and turns
 * solid on scroll; every other page is solid from the start.
 */
export function Header() {
  const { t } = useI18n();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [wide, setWide] = useState(false);
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const portalLogin = getPortalLoginUrl();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const mq = window.matchMedia('(min-width: 1024px)');
    const onWide = () => setWide(mq.matches);
    onWide();
    mq.addEventListener('change', onWide);
    return () => { window.removeEventListener('scroll', onScroll); mq.removeEventListener('change', onWide); };
  }, []);

  // The sheet closes on navigation and on Esc; the page behind it does not scroll.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  // Transparent only on a wide screen over the home hero; phones always get the solid bar.
  const glass = isHome && !scrolled && wide;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50" data-testid="site-header">
        <div
          className={`transition-[background-color,box-shadow] duration-300 ${glass ? 'bg-gradient-to-b from-black/55 to-transparent shadow-none' : 'bg-[var(--ejo-bg)]/95 shadow-[0_1px_0_var(--ejo-border)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--ejo-bg)]/85'}`}
          data-glass={glass ? 'true' : 'false'}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[72px]">
            <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label={siteConfig.organisationName}>
              <SiteWordmark tone={glass ? 'light' : 'default'} />
            </Link>

            <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
              {siteNav.map((item) => {
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
                const tone = glass ? 'text-white/85 hover:text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]';
                return (
                  <div key={item.href} className="group relative">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`relative inline-flex h-10 items-center whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium transition-colors 2xl:px-3 2xl:text-[13.5px] ${tone} ${active ? (glass ? 'text-white' : 'text-[var(--ejo-text)]') : ''}`}
                    >
                      {t(item.key)}
                      {active ? <span aria-hidden className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full ${glass ? 'bg-white' : 'bg-[var(--ejo-primary)]'}`} /> : null}
                    </Link>
                    {item.children ? (
                      <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                        <div className="w-56 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-2 shadow-xl">
                          {item.children.map((child) => (
                            <Link key={child.href} href={child.href} className="block px-4 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-primary)]">{child.label}</Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className="hidden 2xl:inline-flex"><LanguageSelector dark={glass} /></span>
              <span className="hidden lg:inline-flex"><SearchModal dark={glass} /></span>
              <ThemeToggle dark={glass} />
              <Link
                href="/customer-portal"
                className={`hidden h-10 items-center whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors lg:inline-flex ${glass ? 'border-white/30 text-white hover:bg-white/10' : 'border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}
              >
                {t('header.customerLogin')}
              </Link>
              {portalLogin ? (
                <a href={portalLogin} className="hidden h-10 items-center whitespace-nowrap rounded-full bg-[var(--ejo-primary)] px-3.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 lg:inline-flex">
                  {t('header.employeeLogin')}
                </a>
              ) : null}
              <button
                type="button"
                className={`flex h-11 w-11 items-center justify-center rounded-full xl:hidden ${glass ? 'text-white' : 'text-[var(--ejo-text)]'}`}
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                aria-expanded={open}
                aria-controls="site-menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/50 xl:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.div
              id="site-menu"
              initial={reduce ? { opacity: 0 } : { x: '100%' }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '100%' }}
              transition={{ type: 'tween', duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="fixed inset-y-0 right-0 z-[120] flex w-[min(24rem,92vw)] flex-col bg-[var(--ejo-bg)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl xl:hidden"
            >
              <div className="flex h-14 items-center justify-between gap-3 px-4">
                <Link href="/" onClick={() => setOpen(false)} className="min-w-0" aria-label={siteConfig.organisationName}><SiteWordmark /></Link>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-2 border-b border-[var(--ejo-border)] px-4 pb-3">
                <LanguageSelector align="left" />
                <SearchModal />
                <span className="ml-auto"><ThemeToggle /></span>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Main">
                {siteNav.map((item) => {
                  const active = pathname === item.href;
                  if (!item.children) {
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={`flex min-h-12 items-center rounded-[var(--ejo-radius-md)] px-3 text-[15px] font-medium ${active ? 'bg-[var(--ejo-surface)] text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>{t(item.key)}</Link>
                    );
                  }
                  const expanded = openGroup === item.href;
                  return (
                    <div key={item.href}>
                      <div className="flex items-stretch">
                        <Link href={item.href} onClick={() => setOpen(false)} className={`flex min-h-12 flex-1 items-center rounded-[var(--ejo-radius-md)] px-3 text-[15px] font-medium ${active ? 'text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>{t(item.key)}</Link>
                        <button type="button" aria-label={expanded ? `Hide ${t(item.key)} pages` : `Show ${t(item.key)} pages`} aria-expanded={expanded} onClick={() => setOpenGroup(expanded ? null : item.href)} className="flex w-12 items-center justify-center rounded-[var(--ejo-radius-md)] text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)]">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                      </div>
                      {expanded ? (
                        <div className="mb-1 ml-3 border-l border-[var(--ejo-border)] pl-2">
                          {item.children.map((c) => (
                            <Link key={c.href} href={c.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-[var(--ejo-radius-md)] px-3 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]">{c.label}</Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </nav>
              <div className="space-y-2 border-t border-[var(--ejo-border)] px-4 pt-3">
                <Link href="/customer-portal" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center rounded-full border border-[var(--ejo-border)] px-4 text-sm font-medium text-[var(--ejo-text)]">{t('header.customerLogin')}</Link>
                {portalLogin ? <a href={portalLogin} className="flex min-h-11 items-center justify-center rounded-full bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white">{t('header.employeeLogin')}</a> : null}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
