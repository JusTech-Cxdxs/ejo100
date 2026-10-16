'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mailFrameDocument } from '@/lib/mail/html-frame';
import { Icon } from '@/components/ui';

/**
 * An email shown with its own layout, safely: a sandboxed frame that runs no
 * scripts (the HTML was cleaned on the server too), sized to its content.
 * Pictures from the sender's servers stay hidden until the reader asks, so
 * opening an email never tells the sender it was read.
 */
export function MailHtmlFrame({ html, remoteImages, text }: { html: string; remoteImages: number; text: string }) {
  const [showImages, setShowImages] = useState(false);
  const [plain, setPlain] = useState(false);
  const [height, setHeight] = useState(240);
  const frame = useRef<HTMLIFrameElement>(null);

  const measure = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.documentElement) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    if (h > 0) setHeight(Math.min(h + 8, 20_000));
  }, []);

  useEffect(() => {
    const el = frame.current;
    if (!el || plain) return;
    let ro: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      const body = el.contentDocument?.body;
      if (body && 'ResizeObserver' in window) { ro = new ResizeObserver(measure); ro.observe(body); }
      // Pictures arriving late change the height.
      el.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure, { once: true }));
    };
    el.addEventListener('load', onLoad);
    return () => { el.removeEventListener('load', onLoad); ro?.disconnect(); };
  }, [measure, showImages, plain]);

  return (
    <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {remoteImages > 0 && !showImages && !plain ? (
          <p className="flex flex-1 flex-wrap items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2 text-[var(--ejo-text-muted)]">
            <Icon name="eye" size={14} />Pictures from the sender are hidden to protect your privacy.
            <button type="button" onClick={() => setShowImages(true)} className="min-h-9 font-medium text-[var(--ejo-primary)] hover:underline">Show pictures</button>
          </p>
        ) : <span className="flex-1" />}
        <button type="button" onClick={() => setPlain((p) => !p)} className="min-h-9 rounded-[var(--ejo-radius-md)] px-2 font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]">
          {plain ? 'Show original layout' : 'Show as plain text'}
        </button>
      </div>
      {plain ? (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--ejo-text)]">{text || '(This message has no text.)'}</div>
      ) : (
        <div className="overflow-hidden rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-white">
          <iframe
            key={showImages ? 'with-images' : 'no-images'}
            ref={frame}
            title="Email content"
            srcDoc={mailFrameDocument(html, showImages)}
            // No scripts ever; same-origin only so the frame can be sized to its content.
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className="block w-full"
            style={{ height }}
          />
        </div>
      )}
    </div>
  );
}
