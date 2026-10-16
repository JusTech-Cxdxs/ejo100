'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FloatingLayer } from '@/components/ui/FloatingLayer';
import type { EnyoTone } from '@/lib/enyo/client-contract';
import { getEnyoStatus, refineText } from './api';
import { EIcon } from './icons';

/**
 * "Refine": Enyo rewrites what the person typed in a text box (by id) in the
 * tone they pick, and shows it next to the original. Nothing changes until
 * they press "Use this"; "Keep mine" leaves their words as they were.
 * Shows nothing when Enyo is not switched on. Never inside a <label>, so the
 * field's accessible name is unchanged.
 */
const TONES: { tone: EnyoTone; label: string }[] = [
  { tone: 'polite', label: 'More polite' },
  { tone: 'formal', label: 'More formal' },
  { tone: 'short', label: 'Shorter' },
  { tone: 'friendly', label: 'Friendlier' },
  { tone: 'clear', label: 'Clearer' },
  { tone: 'decision', label: 'As a decision note' },
];

type Field = HTMLTextAreaElement | HTMLInputElement;

function field(id: string): Field | null {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el : null;
}

/** Sets a value so React-controlled fields notice it too. */
function setFieldValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function RefineTextButton({ targetId, label, compact = false }: { targetId: string; /** What the field is, for the button's name when several are on one page ("complaint 2"). */ label?: string; /** Icon only (for single-line rows). */ compact?: boolean }) {
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ original: string; refined: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    let live = true;
    void getEnyoStatus().then((s) => { if (live) setReady(s.ready); });
    return () => { live = false; };
  }, []);

  // Escape inside a dialog closes only this menu, not the dialog.
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); button.current?.focus(); } };
    document.addEventListener('keydown', esc, true);
    const id = requestAnimationFrame(() => document.getElementById(menuId)?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
    return () => { document.removeEventListener('keydown', esc, true); cancelAnimationFrame(id); };
  }, [menu, menuId]);
  const closeMenu = useCallback(() => setMenu(false), []);

  if (!ready) return null;

  async function run(tone: EnyoTone) {
    setMenu(false);
    setMessage(null);
    setResult(null);
    const el = field(targetId);
    const original = el?.value.trim() ?? '';
    if (!el) return;
    if (original.length < 3) { setMessage('Write something first, then refine it.'); return; }
    setBusy(true);
    const r = await refineText(original.slice(0, 4000), tone);
    setBusy(false);
    if ('text' in r) {
      const max = el.maxLength > 0 ? el.maxLength : 4000;
      setResult({ original, refined: r.text.trim().slice(0, max) });
    } else setMessage(r.ref ? `${r.error} (reference ${r.ref})` : r.error);
  }

  function applySuggestion() {
    const el = field(targetId);
    if (el && result) { setFieldValue(el, result.refined); el.focus(); }
    setResult(null);
  }

  const name = label ? `Refine ${label}` : 'Refine';

  return (
    <div ref={wrap} className={compact ? 'relative shrink-0' : 'relative mt-1.5 flex flex-col items-end gap-2'} data-enyo-refine={targetId}>
      <button
        ref={button}
        type="button"
        onClick={() => setMenu((m) => !m)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-controls={menu ? menuId : undefined}
        aria-label={compact || label ? name : undefined}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full text-xs font-medium text-[var(--ejo-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--ejo-primary)_9%,transparent)] disabled:opacity-60 sm:min-h-8 ${compact ? 'min-w-11 justify-center sm:min-w-8' : 'px-2.5'}`}
      >
        <EIcon name="wand" size={15} />
        {compact ? null : busy ? 'Refining…' : 'Refine'}
      </button>
      {/* Drawn above everything (cards that clip, sticky bars, dialogs' own scroll). */}
      <FloatingLayer anchor={button} open={menu} onClose={closeMenu} align="right" width="12rem" gap={4} label="Choose a tone">
        <div id={menuId} className="py-1">
          {TONES.map((t) => (
            <button key={t.tone} type="button" role="menuitem" onClick={() => void run(t.tone)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] focus:bg-[var(--ejo-bg)] focus:outline-none">
              {t.label}
            </button>
          ))}
        </div>
      </FloatingLayer>
      {busy && compact ? <p role="status" className="sr-only">Refining…</p> : null}
      {message ? <p role="status" className={compact ? 'absolute right-0 top-full z-30 mt-1 w-56 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-2 text-xs text-[var(--ejo-text-muted)] shadow-lg' : 'w-full text-right text-xs text-[var(--ejo-text-muted)]'}>{message}</p> : null}
      {result ? (
        <div role="region" aria-label="Suggested wording" className={`${compact ? 'absolute right-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] shadow-xl' : 'w-full'} rounded-[var(--ejo-radius-md)] border border-[color-mix(in_srgb,var(--ejo-primary)_35%,var(--ejo-border))] bg-[color-mix(in_srgb,var(--ejo-primary)_4%,var(--ejo-bg))] p-3 text-left`}>
          <p className="text-[11px] font-medium text-[var(--ejo-text-muted)]">Yours</p>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs text-[var(--ejo-text-muted)]">{result.original}</p>
          <p className="mt-2.5 text-[11px] font-medium text-[var(--ejo-primary)]">Suggested</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--ejo-text)] [overflow-wrap:anywhere]">{result.refined}</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setResult(null)} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)] sm:min-h-9">Keep mine</button>
            <button type="button" onClick={applySuggestion} className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-medium text-white hover:brightness-110 sm:min-h-9">Use this</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
