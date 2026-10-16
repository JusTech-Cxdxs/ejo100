'use client';

import { useState } from 'react';
import { MAIL_STYLES, MAIL_STYLE_LABEL, type MailStyle } from '@/lib/email-templates/personal-mail-styles';
import { MAIL_STYLE_EVENT } from './LiveMailPreview';

/**
 * How the email goes out: the organisation letterhead (with an optional
 * label) or plain text. The live preview beside the form (LiveMailPreview)
 * follows the choice at once.
 */
export function MailStyleField({ initial }: { initial: MailStyle }) {
  const [style, setStyle] = useState<MailStyle>(initial);
  const choose = (s: MailStyle) => {
    setStyle(s);
    window.dispatchEvent(new CustomEvent(MAIL_STYLE_EVENT, { detail: s }));
  };
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-[var(--ejo-text)]">How it looks</legend>
      <input type="hidden" name="style" value={style} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Email style">
        {MAIL_STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={style === s} title={MAIL_STYLE_LABEL[s].help} onClick={() => choose(s)}
            className={`min-h-10 rounded-full border px-3.5 text-sm transition-colors ${style === s ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 font-medium text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50'}`}>
            {MAIL_STYLE_LABEL[s].label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{MAIL_STYLE_LABEL[style].help}</p>
    </fieldset>
  );
}
