'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * A menu or pop-over drawn ABOVE everything on the page (headers, tab bars,
 * tables that scroll, cards that clip), anchored to the button that opened
 * it. It is placed in the page's top layer (a portal on <body>), opens below
 * the button or above it when there is no room, stays inside the screen,
 * follows the button while the page scrolls, and closes with Escape or a
 * click elsewhere (focus goes back to the button).
 *
 * Layering (the one scale for the whole portal, see globals.css):
 *   page content < sticky bars (z-20/30) < app header (z-40) < drawers (z-50)
 *   < dialogs (z-[70]) < floating menus (z-[80]) — a menu opened inside a
 *   dialog must sit above that dialog.
 */
export function FloatingLayer({
  anchor,
  open,
  onClose,
  align = 'left',
  width,
  gap = 8,
  label,
  children,
  role = 'menu',
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: 'left' | 'right';
  /** CSS width of the layer, e.g. '14rem'. Defaults to the anchor's width. */
  width?: string;
  gap?: number;
  label?: string;
  children: ReactNode;
  role?: 'menu' | 'dialog' | 'listbox';
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; maxHeight: number; above: boolean } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current;
    const el = layer.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el?.offsetWidth ?? r.width;
    const h = el?.scrollHeight ?? 0;
    const below = vh - r.bottom - gap - 8;
    const aboveRoom = r.top - gap - 8;
    const above = h > below && aboveRoom > below;
    const maxHeight = Math.max(160, above ? aboveRoom : below);
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.min(Math.max(8, left), Math.max(8, vw - w - 8));
    const top = above ? Math.max(8, r.top - gap - Math.min(h, maxHeight)) : r.bottom + gap;
    setPos({ top, left, minWidth: r.width, maxHeight, above });
  }, [anchor, align, gap]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    // Second pass once the layer has its real size.
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (layer.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); anchor.current?.focus(); }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place, onClose, anchor]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={layer}
      role={role}
      aria-label={label}
      data-floating-layer=""
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width,
        minWidth: width ? undefined : pos?.minWidth,
        maxHeight: pos?.maxHeight,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="ejo-pop z-[80] overflow-y-auto overscroll-contain rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-2xl shadow-black/15 ring-1 ring-black/5 print:hidden"
    >
      {children}
    </div>,
    document.body,
  );
}
