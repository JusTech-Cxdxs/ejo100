'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { searchSite } from '@/lib/search-index';
import { SearchIcon } from './icons';

/**
 * Real client-side search over the site's static index (see
 * lib/search-index.ts) — filters as you type and navigates on selection.
 * No backend search service exists yet; this is a genuine, working search
 * over everything currently indexable (pages, businesses, products, news,
 * careers), not a placeholder.
 */
export function SearchModal({ dark = false }: { dark?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchSite(query), [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function goTo(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className={`rounded-full p-2 transition-colors ${
          dark ? 'text-white/90 hover:bg-white/10' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'
        }`}
      >
        <SearchIcon width={18} height={18} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-6 pt-32 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-bg)] shadow-2xl"
            >
              <div className="flex items-center gap-3 px-4 pt-3">
                <SearchIcon width={18} height={18} className="shrink-0 text-[var(--ejo-text-muted)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('search.placeholder')}
                  className="w-full bg-transparent py-3 text-base text-[var(--ejo-text)] outline-none"
                />
              </div>

              {query.trim() && (
                <div className="max-h-80 overflow-y-auto border-t border-[var(--ejo-border)] px-2 py-2">
                  {results.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-[var(--ejo-text-muted)]">{t('search.noResults')}</p>
                  ) : (
                    results.map((r) => (
                      <button
                        key={`${r.category}-${r.title}`}
                        onClick={() => goTo(r.href)}
                        className="flex w-full items-center justify-between rounded-[var(--ejo-radius-md)] px-3 py-2.5 text-left text-sm hover:bg-[var(--ejo-surface)]"
                      >
                        <span className="text-[var(--ejo-text)]">{r.title}</span>
                        <span className="text-xs text-[var(--ejo-text-muted)]">{r.category}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="border-t border-[var(--ejo-border)] px-4 py-2.5 text-xs text-[var(--ejo-text-muted)]">
                {t('search.close')}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
