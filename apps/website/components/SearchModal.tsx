'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * UI only — no search index/backend wired up yet. Structured so a real
 * search API can be dropped into handleSearch without touching the UI.
 */
export function SearchModal({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        className={`rounded-full p-2 transition-colors ${
          dark ? 'text-white/90 hover:bg-white/10' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
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
              className="w-full max-w-xl rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-bg)] p-2 shadow-2xl"
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Kewalram Chanrai Group..."
                className="w-full rounded-[var(--ejo-radius-md)] bg-transparent px-4 py-3 text-lg text-[var(--ejo-text)] outline-none"
              />
              <div className="border-t border-[var(--ejo-border)] px-4 py-3 text-xs text-[var(--ejo-text-muted)]">
                Press Esc to close
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
