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
import { PromoBar } from './site/PromoBar';

/**
 * The site header. On a phone it is always a solid bar — wordmark, theme
 * toggle and the menu button — so it reads on every page and photo; the
 * menu is a full-height sheet with language, search and the two sign-ins.
 * On a wide screen the home page starts transparent over the hero and turns
 * solid on scroll; every other page is solid from the start.
 */
/** How many pages show on their own between 1280px and 1760px (Home first); the rest go under "More" — all ten fit side by side from 1760px. */
const PRIMARY = 6;

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
  // Home is a page like the others: visitors on an inner page always have a way back, not only the logo.
  const pages = siteNav;
  const linkCls = `relative inline-flex h-10 items-center whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-medium transition-colors 2xl:px-3 2xl:text-sm ${glass ? 'text-white/85 hover:bg-white/10 hover:text-white' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]'}`;
  const activeCls = glass ? 'text-white' : 'text-[var(--ejo-text)]';

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50" data-testid="site-header">
        <div
          className={`transition-[background-color,box-shadow] duration-300 ${glass ? 'bg-gradient-to-b from-black/55 to-transparent shadow-none' : 'bg-[var(--ejo-bg)]/95 shadow-[0_1px_0_var(--ejo-border)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--ejo-bg)]/85'}`}
          data-glass={glass ? 'true' : 'false'}
        >
          <PromoBar dark={glass} />
          {/* Full width: the wordmark at the left edge, the sign-ins at the right, the pages between — room to breathe on a wide screen. */}
          <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6 lg:h-[76px] lg:px-5 2xl:px-7">
            <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label={siteConfig.organisationName}>
              <SiteWordmark tone={glass ? 'light' : 'default'} />
            </Link>

            {/* The pages: Home and the next five show from 1280px; the rest sit under "More" until there is room for all on one line. */}
            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 px-4 xl:flex 2xl:gap-1.5" aria-label="Main">
              {pages.map((item, index) => {
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
                const later = index >= PRIMARY;
                return (
                  <div key={item.href} className={`group relative ${later ? 'hidden min-[1760px]:block' : ''}`}>
                    <Link href={item.href} aria-current={active ? 'page' : undefined} className={`${linkCls} ${active ? activeCls : ''}`}>
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
              {pages.length > PRIMARY ? (
                <div className="group relative min-[1760px]:hidden">
                  <button type="button" className={`${linkCls} gap-1 ${pages.slice(PRIMARY).some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ? activeCls : ''}`} aria-haspopup="true">
                    {t('nav.more')}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <div className="invisible absolute right-0 top-full pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <div className="w-60 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] py-2 shadow-xl">
                      {pages.slice(PRIMARY).map((item) => (
                        <Link key={item.href} href={item.href} className="block px-4 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-primary)]">{t(item.key)}</Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className="hidden xl:inline-flex"><LanguageSelector dark={glass} compact /></span>
              <span className="hidden lg:inline-flex"><SearchModal dark={glass} /></span>
              <ThemeToggle dark={glass} />
              <span aria-hidden className={`mx-1 hidden h-6 w-px lg:block ${glass ? 'bg-white/25' : 'bg-[var(--ejo-border)]'}`} />
              <Link
                href="/customer-portal"
                className={`hidden h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-all lg:inline-flex ${glass ? 'border-white/35 text-white hover:bg-white/10' : 'border-[var(--ejo-border)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
                {t('header.customerLogin')}
              </Link>
              {portalLogin ? (
                <a href={portalLogin} className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[var(--ejo-primary)] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(34,152,63,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_10px_20px_-8px_rgba(34,152,63,0.7)] lg:inline-flex">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>
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
