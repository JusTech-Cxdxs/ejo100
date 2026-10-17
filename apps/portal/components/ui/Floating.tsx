'use client';

import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type Place = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

/**
 * A list that floats above the page, anchored to a field: drawn in <body>
 * (or the open modal it sits in) with fixed positioning, so no card, table,
 * scroll area or stacking context can clip it or paint over it. It opens
 * downwards, or upwards when there is more room above; it is never wider than
 * the screen; it follows the field when the page scrolls or resizes.
 *
 * Layers: z-[85], above pop-over menus (z-[80]) and phone sheets (z-[60]),
 * below the full-page select search (z-[90]) and the progress bar.
 *
 * The caller keeps its own open/close logic; `panelRef` lets it treat clicks
 * inside the list as inside the field.
 */
export function Floating({
  anchor, open, children, panelRef, minWidth = 256, maxHeight = 320, className = '', id, role, ariaLabel,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  children: ReactNode;
  panelRef?: RefObject<HTMLDivElement | null>;
  minWidth?: number;
  maxHeight?: number;
  className?: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
}) {
  const [place, setPlace] = useState<Place | null>(null);

  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    let frame = 0;
    const measure = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // The field scrolled away (out of the window, or under the header or a
      // scroll area's edge): hide the list rather than float it over the page.
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const cy = r.top + r.height / 2;
      const hit = cy >= 0 && cy < window.innerHeight ? document.elementFromPoint(cx, cy) : null;
      if (!hit || !(el === hit || el.contains(hit) || hit.contains(el) || el.parentElement?.contains(hit))) { setPlace(null); return; }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(Math.max(r.width, Math.min(minWidth, vw - 16)), vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      const up = below < Math.min(maxHeight, 220) && above > below;
      const room = Math.max(120, Math.min(maxHeight, up ? above : below));
      setPlace(up ? { left, width, bottom: vh - r.top + 4, maxHeight: room } : { left, width, top: r.bottom + 4, maxHeight: room });
    };
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', later, true);
    window.addEventListener('resize', later);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', later, true);
      window.removeEventListener('resize', later);
    };
  }, [open, anchor, minWidth, maxHeight]);

  if (!open || !place || typeof document === 'undefined') return null;
  // A modal <dialog> makes the rest of the page unreachable: draw inside it instead.
  const host = (anchor.current?.closest('dialog[open]') as HTMLElement | null) ?? document.body;
  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      data-floating=""
      style={{ position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
      className={`z-[85] overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-xl ${className}`}
    >
      {children}
    </div>,
    host,
  );
}
