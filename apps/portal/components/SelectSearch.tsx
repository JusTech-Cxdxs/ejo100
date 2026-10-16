'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Every dropdown in the portal can be searched. Mounted once in the signed-in
 * layout: when someone clicks (or presses Enter / Space / Alt+↓ on) a
 * <select> with several choices, a search box with the choices opens instead
 * of the browser's plain list. Typing filters by any part of the text;
 * ↑ ↓ Enter choose, Esc closes. Picking sets the <select> exactly as a person
 * would (value + change event), so forms, React state and "submit on change"
 * filters all work as before — and nothing is ever chosen for the person.
 *
 * Left alone: short lists (fewer than MIN choices), multi-selects, list
 * boxes (size > 1), disabled selects, and any <select data-plain>.
 */
const MIN = 6;

type Opt = { value: string; label: string; group: string; disabled: boolean };

function wants(el: EventTarget | null): el is HTMLSelectElement {
  return el instanceof HTMLSelectElement && !el.multiple && !el.disabled && el.size <= 1 && el.dataset.plain === undefined && el.options.length >= MIN;
}

function optionsOf(sel: HTMLSelectElement): Opt[] {
  return Array.from(sel.options).map((o) => ({
    value: o.value,
    label: (o.label || o.text).trim(),
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : '',
    disabled: o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled),
  }));
}

/** Sets the value so React-controlled selects notice it too, then tells the page. */
function choose(sel: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(sel, value); else sel.value = value;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

export function SelectSearch() {
  const [target, setTarget] = useState<HTMLSelectElement | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ left: number; top: number; width: number; up: boolean; sheet: boolean; maxH: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const open = useCallback((sel: HTMLSelectElement) => {
    const r = sel.getBoundingClientRect();
    const sheet = window.innerWidth < 640;
    const below = window.innerHeight - r.bottom;
    const up = !sheet && below < 280 && r.top > below;
    setBox({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 8)), top: up ? r.top : r.bottom, width: Math.max(r.width, 260), up, sheet, maxH: Math.max(180, Math.min(360, (up ? r.top : below) - 16)) });
    setQ('');
    setTarget(sel);
    const at = Math.max(0, sel.selectedIndex);
    setActive(at);
  }, []);

  const close = useCallback((refocus = true) => {
    setTarget((t) => { if (t && refocus) requestAnimationFrame(() => t.focus()); return null; });
  }, []);

  // Open instead of the browser's list — mouse, keyboard and touch (a tap, not a scroll that ends on a select).
  useEffect(() => {
    let touch: { x: number; y: number; at: number } | null = null;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !wants(e.target)) return;
      e.preventDefault();
      (e.target as HTMLSelectElement).focus();
      open(e.target as HTMLSelectElement);
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touch = wants(e.target) && t ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!touch || !t || !wants(e.target)) return;
      const tap = Math.abs(t.clientX - touch.x) < 10 && Math.abs(t.clientY - touch.y) < 10 && Date.now() - touch.at < 800;
      touch = null;
      if (!tap) return;
      e.preventDefault(); // no native picker, no synthetic mouse events
      open(e.target as HTMLSelectElement);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!wants(e.target)) return;
      if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
        e.preventDefault();
        open(e.target as HTMLSelectElement);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', onTouchEnd, true);
    };
  }, [open]);

  // Close on an outside click, a scroll of the page, or a resize.
  useEffect(() => {
    if (!target) return;
    const out = (e: MouseEvent) => { if (panel.current && !panel.current.contains(e.target as Node) && e.target !== target) close(false); };
    const away = (e: Event) => { if (!panel.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', out);
    document.addEventListener('touchstart', out as unknown as EventListener, { passive: true });
    // A floating list follows nothing: it closes when the page moves. The phone sheet stays (the keyboard opening resizes and scrolls the page).
    const sheet = window.innerWidth < 640;
    if (!sheet) { window.addEventListener('resize', away); window.addEventListener('scroll', away, true); }
    return () => {
      document.removeEventListener('mousedown', out);
      document.removeEventListener('touchstart', out as unknown as EventListener);
      window.removeEventListener('resize', away);
      window.removeEventListener('scroll', away, true);
    };
  }, [target, close]);

  const all = useMemo(() => (target ? optionsOf(target) : []), [target]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => all.map((o, i) => ({ ...o, i })).filter((o) => !words.length || words.every((w) => `${o.label} ${o.group}`.toLowerCase().includes(w))), [all, words]);

  useEffect(() => { if (q) setActive(shown.find((o) => !o.disabled)?.i ?? -1); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, target]);

  if (!target || !box) return null;
  const pick = (o: Opt) => { if (o.disabled) return; const sel = target; close(); choose(sel, o.value); };
  const move = (dir: 1 | -1) => {
    const enabled = shown.filter((o) => !o.disabled);
    if (!enabled.length) return;
    const at = enabled.findIndex((o) => o.i === active);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, at === -1 ? 0 : at + dir))]!;
    setActive(next.i);
  };
  const name = target.getAttribute('aria-label') || (target.id && document.querySelector(`label[for="${CSS.escape(target.id)}"]`)?.textContent?.trim()) || 'Choose';
  let lastGroup = '';

  return createPortal(
    <div className={box.sheet ? 'fixed inset-0 z-[90] flex items-end bg-black/30' : ''}>
      <div
        ref={panel}
        role="dialog"
        aria-label={name}
        style={box.sheet ? undefined : { position: 'fixed', left: box.left, width: box.width, ...(box.up ? { bottom: window.innerHeight - box.top + 4 } : { top: box.top + 4 }) }}
        className={`z-[90] flex flex-col overflow-hidden border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-2xl ${box.sheet ? 'max-h-[75dvh] w-full rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'rounded-[var(--ejo-radius-md)]'}`}
        data-testid="select-search"
      >
        <div className="border-b border-[var(--ejo-border)] p-2">
          {box.sheet ? <p className="px-1 pb-2 text-sm font-semibold text-[var(--ejo-text)]">{name}</p> : null}
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
              else if (e.key === 'Enter') { e.preventDefault(); const o = all[active]; if (o && shown.some((s) => s.i === active)) pick(o); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
              else if (e.key === 'Tab') close();
            }}
            placeholder="Type to search…"
            aria-label={`Search ${name}`}
            aria-controls="select-search-list"
            className="min-h-10 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-base text-[var(--ejo-text)] focus:border-[var(--ejo-primary)] focus:outline-none sm:text-sm"
          />
        </div>
        <ul ref={list} id="select-search-list" role="listbox" aria-label={name} className="overflow-y-auto py-1" style={box.sheet ? undefined : { maxHeight: box.maxH }}>
          {shown.length === 0 ? <li className="px-3 py-2 text-sm text-[var(--ejo-text-muted)]">Nothing matches “{q.trim()}”.</li> : null}
          {shown.map((o) => {
            const head = o.group && o.group !== lastGroup ? o.group : '';
            lastGroup = o.group;
            const selected = target.selectedIndex === o.i;
            return (
              <li key={o.i} role="presentation">
                {head ? <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{head}</p> : null}
                <button
                  type="button"
                  role="option"
                  data-i={o.i}
                  aria-selected={selected}
                  disabled={o.disabled}
                  onMouseEnter={() => setActive(o.i)}
                  onClick={() => pick(o)}
                  className={`flex min-h-10 w-full items-center px-3 text-left text-sm disabled:opacity-40 ${active === o.i ? 'bg-[var(--ejo-primary)]/10' : ''} ${selected ? 'font-semibold text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)]'}`}
                >
                  {o.label || <span className="text-[var(--ejo-text-muted)]">(none)</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
