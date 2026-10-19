'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Wraps a block that rises in when it scrolls into view (CSS .ejo-reveal); shown at once without JavaScript or with reduced motion. */
export function Reveal({ children, className = '', as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'ul' | 'li' }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { el.classList.add('is-in'); return; }
    const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { el.classList.add('is-in'); io.disconnect(); } }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as 'div';
  return <T ref={ref as never} className={`ejo-reveal ${className}`}>{children}</T>;
}
