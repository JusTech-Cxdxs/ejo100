'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyLetterhead, type MailLetterhead } from '@/lib/actions/mail';
import { renderPersonalMail } from '@/lib/email-templates/personal-mail';
import { MAIL_STYLES, type MailStyle } from '@/lib/email-templates/personal-mail-styles';

/** Fired by the style picker (MailStyleField) when the person chooses a style. */
export const MAIL_STYLE_EVENT = 'ejo:mail-style';

const styleOf = (v: unknown): MailStyle => ((MAIL_STYLES as readonly string[]).includes(String(v)) ? (v as MailStyle) : 'standard');

/**
 * What the recipient will see, updated as the person types (Compose).
 * Wide screens: a panel beside the form that follows the page. Phones: a
 * section under the form, folded until opened. Drawn in the browser from the
 * person's letterhead (fetched once), so typing makes no requests, and
 * nothing in the form is ever reset. The person can switch it off for this
 * message. The frame runs no scripts.
 */
export function LiveMailPreview({ formId, initialStyle }: { formId: string; initialStyle: MailStyle }) {
  const [on, setOn] = useState(true);
  const [openMobile, setOpenMobile] = useState(false);
  const [head, setHead] = useState<MailLetterhead | null | 'loading' | 'error'>('loading');
  const [doc, setDoc] = useState<string | null>(null);
  const [style, setStyle] = useState<MailStyle>(initialStyle);
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  const scroll = useRef<number[]>([0, 0]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    getMyLetterhead().then((h) => { if (alive) setHead(h); }).catch(() => { if (alive) setHead('error'); });
    return () => { alive = false; };
  }, []);

  const render = useCallback(() => {
    if (!on || !head || head === 'loading' || head === 'error') return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const subject = String((form.elements.namedItem('subject') as HTMLInputElement | null)?.value ?? '').replace(/[\r\n\t]+/g, ' ').trim() || '(no subject)';
    const body = String((form.elements.namedItem('body') as HTMLTextAreaElement | null)?.value ?? '').replace(/\r\n?/g, '\n');
    if (style === 'plain') { setDoc(null); return; }
    // Keep where the person had scrolled to in the preview.
    frames.current.forEach((f, i) => { try { scroll.current[i] = f?.contentWindow?.scrollY ?? 0; } catch { /* not ready */ } });
    setDoc(renderPersonalMail({ subject, body, style, ...head }));
  }, [on, head, style, formId]);

  useEffect(() => {
    render();
    const form = document.getElementById(formId);
    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(render, 250);
    };
    const onStyle = (e: Event) => setStyle(styleOf((e as CustomEvent<string>).detail));
    form?.addEventListener('input', schedule);
    form?.addEventListener('change', schedule);
    window.addEventListener(MAIL_STYLE_EVENT, onStyle);
    return () => {
      form?.removeEventListener('input', schedule);
      form?.removeEventListener('change', schedule);
      window.removeEventListener(MAIL_STYLE_EVENT, onStyle);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [render, formId]);

  const restore = (i: number) => () => { try { frames.current[i]?.contentWindow?.scrollTo(0, scroll.current[i] ?? 0); } catch { /* fine */ } };

  const body = (i: number) => {
    if (!on) return <p className="p-4 text-sm text-[var(--ejo-text-muted)]">Live preview is off for this message.</p>;
    if (head === 'loading') return <p role="status" className="p-4 text-sm text-[var(--ejo-text-muted)]">Preparing the preview…</p>;
    if (head === 'error' || head === null) return <p className="p-4 text-sm text-[var(--ejo-text-muted)]">The preview could not be prepared just now. Your email still goes out in the letterhead.</p>;
    if (style === 'plain') return <p className="p-4 text-sm text-[var(--ejo-text-muted)]">Plain text: the recipient sees your words exactly as you typed them, with no letterhead.</p>;
    return (
      <iframe
        ref={(el) => { frames.current[i] = el; }}
        title="What the recipient sees"
        srcDoc={doc ?? ''}
        onLoad={restore(i)}
        // Same origin only so the scroll position can be kept; never scripts.
        sandbox="allow-same-origin"
        className="h-full min-h-[28rem] w-full flex-1 bg-white"
      />
    );
  };

  const toggle = (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium text-[var(--ejo-text-muted)]">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-[var(--ejo-primary)]" />
      Live preview
    </label>
  );

  return (
    <>
      {/* Wide screens: beside the form, following the page. */}
      <aside aria-label="Email preview" className="hidden lg:block">
        <div className="sticky top-4 flex h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--ejo-border)] px-4 py-1.5">
            <p className="text-sm font-semibold text-[var(--ejo-text)]">What the recipient sees</p>
            {toggle}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{body(0)}</div>
        </div>
      </aside>
      {/* Phones and tablets: under the form, opened when wanted. */}
      <section aria-label="Email preview" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-1.5">
          <button type="button" aria-expanded={openMobile} onClick={() => setOpenMobile((v) => !v)} className="min-h-10 text-sm font-semibold text-[var(--ejo-primary)]">
            {openMobile ? 'Hide preview' : 'See what the recipient sees'}
          </button>
          {openMobile ? toggle : null}
        </div>
        {openMobile ? <div className="flex h-[70dvh] flex-col border-t border-[var(--ejo-border)]">{body(1)}</div> : null}
      </section>
    </>
  );
}
