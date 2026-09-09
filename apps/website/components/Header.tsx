'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { siteNav, getPortalLoginUrl } from '@/lib/site-config';
import { useI18n } from '@/lib/i18n';
import { BrandLogo } from './BrandLogo';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelector } from './LanguageSelector';
import { SearchModal } from './SearchModal';

export function Header() {
  const { t } = useI18n();
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
          <div className="mx-auto flex max-w-7xl flex-nowrap items-center justify-between px-6 py-4">
            <Link href="/" className="flex shrink-0 items-center">
              {/* No scale transform here anymore — it visually enlarged
                  the logo beyond the layout box actually reserved for
                  it (CSS transform:scale never affects layout/flow,
                  only paint), which is exactly what was causing
                  "Kewalram" to collide with the logo. The logo is
                  already sized precisely via the size prop below to
                  match the real wordmark stack height, so no extra
                  scaling is needed or safe to add on top of that.
                  Same real wordmark idea as the print document's own
                  DocumentHeader — a rule that grows to fill exactly
                  the leftover space so "Chanrai Group" ends flush with
                  "Kewalram" above it, whatever the exact text width
                  turns out to be, the same way print's own version is
                  mathematically guaranteed to line up. Two earlier
                  attempts at this on the website both turned out wrong
                  once actually viewed — a nested flex/grid version
                  that silently failed to grow at all, then a
                  fixed-width version that "Chanrai Group" ran past
                  "Kewalram" on. Traced the real, working difference
                  directly against print's own proven markup this time,
                  one variable at a time, rather than guess again: the
                  growing rule only works reliably here inside a real
                  two-column table, exactly like print's own structure
                  — not a flex or grid row on its own. Built with plain
                  inline styles throughout, the same as print's own
                  version, so every piece of it — not just the final
                  look — could be verified directly against real
                  rendered pixels before shipping, nothing left on
                  trust. The rule is always the real brand green —
                  never swapped for white on the transparent hero
                  state, on purpose; only the text around it dims for
                  contrast against the hero image, the accent color
                  itself stays constant. */}
              <table role="presentation" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: 'middle', padding: 0 }}>
                      <BrandLogo transparent={transparent} size={31} />
                    </td>
                    <td style={{ verticalAlign: 'middle', paddingLeft: '2px' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', whiteSpace: 'nowrap' }}>
                        <span className={`block text-base font-bold leading-tight ${transparent ? 'text-white' : 'text-[var(--ejo-text)]'}`}>
                          Kewalram
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                          <span style={{ flex: 1, marginRight: '6px', borderBottom: '1px solid var(--ejo-primary)' }} />
                          <span className={`block text-[11px] leading-tight ${transparent ? 'text-white/70' : 'text-[var(--ejo-text-muted)]'}`}>
                            Chanrai Group
                          </span>
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Link>

            <nav className="hidden shrink-0 items-center gap-5 whitespace-nowrap lg:ml-6 lg:flex xl:gap-7">
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

            <div className="hidden shrink-0 items-center gap-3 whitespace-nowrap lg:ml-4 lg:flex">
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
              <a
                href={getPortalLoginUrl()}
                className="shrink-0 whitespace-nowrap rounded-full bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.03] hover:opacity-90"
              >
                {t('header.employeeLogin')}
              </a>
            </div>

            <button
              className={`p-2 lg:hidden ${transparent ? 'text-white' : 'text-[var(--ejo-text)]'}`}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ---- Mobile off-canvas menu (unchanged structure — only adding
           search / language / theme controls per this update's scope) ---- */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/60 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              className="fixed inset-y-0 right-0 z-[120] flex w-80 max-w-[85vw] flex-col bg-[var(--ejo-bg)] p-6 shadow-2xl lg:hidden"
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="text-lg font-bold text-[var(--ejo-text)]">Menu</span>
                <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-2 text-[var(--ejo-text)]">
                  ✕
                </button>
              </div>

              <div className="mb-4 flex items-center gap-2 border-b border-[var(--ejo-border)] pb-4">
                <LanguageSelector />
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
              <div className="mt-6 space-y-3 border-t border-[var(--ejo-border)] pt-6">
                <Link
                  href="/customer-portal"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-full border border-[var(--ejo-border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--ejo-text)]"
                >
                  {t('header.customerLogin')}
                </Link>
                <a
                  href={getPortalLoginUrl()}
                  className="block rounded-full bg-[var(--ejo-primary)] px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  {t('header.employeeLogin')}
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
