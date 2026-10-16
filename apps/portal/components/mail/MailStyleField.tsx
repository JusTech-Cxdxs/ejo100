'use client';

import { useEffect, useRef, useState } from 'react';
import { previewMyMail } from '@/lib/actions/mail';
import { MAIL_STYLES, MAIL_STYLE_LABEL, type MailStyle } from '@/lib/email-templates/personal-mail-styles';

/**
 * How the email goes out: the organisation letterhead (with an optional
 * label) or plain text — and a preview of exactly what the recipient sees.
 */
export function MailStyleField({ initial }: { initial: MailStyle }) {
  const [style, setStyle] = useState<MailStyle>(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!preview) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview]);

  const show = async () => {
    const subject = (document.getElementById('mail-subject') as HTMLInputElement | null)?.value ?? '';
    const body = (document.getElementById('mail-body') as HTMLTextAreaElement | null)?.value ?? '';
    setBusy(true);
    setNote('');
    try {
      const r = await previewMyMail({ subject, body, style });
      if (r.html) setPreview(r.html); else setNote('Plain text goes out exactly as you typed it.');
    } catch {
      setNote('The preview could not be made just now.');
    }
    setBusy(false);
  };

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">How it looks</legend>
      <input type="hidden" name="style" value={style} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Email style">
        {MAIL_STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={style === s} title={MAIL_STYLE_LABEL[s].help} onClick={() => setStyle(s)}
            className={`min-h-10 rounded-full border px-3.5 text-sm transition-colors ${style === s ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 font-medium text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50'}`}>
            {MAIL_STYLE_LABEL[s].label}
          </button>
        ))}
        <button type="button" onClick={() => void show()} disabled={busy} className="min-h-10 rounded-full px-3 text-sm font-medium text-[var(--ejo-primary)] hover:underline disabled:opacity-60">
          {busy ? 'Preparing preview…' : 'Preview'}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{MAIL_STYLE_LABEL[style].help}{note ? ` ${note}` : ''}</p>

      {preview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Email preview" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="flex h-full max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-bg)] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--ejo-border)] px-4 py-2.5">
              <p className="text-sm font-semibold text-[var(--ejo-text)]">What the recipient sees</p>
              <button ref={close} type="button" onClick={() => setPreview(null)} className="min-h-10 rounded-[var(--ejo-radius-md)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Close</button>
            </div>
            <iframe title="Email preview" srcDoc={preview} sandbox="" className="min-h-0 w-full flex-1 bg-white" />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
