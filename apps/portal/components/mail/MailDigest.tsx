'use client';

import { useMemo, useState } from 'react';
import { summariseMyMail, type DigestScope } from '@/lib/actions/mail';
import { CATEGORY_LABEL, MAIL_CATEGORIES, type MailCategory } from '@/lib/mail/brief-core';
import { createMouthDriver, useSpeechOutput } from '@/components/enyo/voice';
import { readPrefs } from '@/components/enyo/prefs';

const SCOPES: { value: DigestScope; label: string }[] = [
  { value: 'today', label: "Today's mail" },
  { value: 'unread', label: 'Unread' },
  { value: 'needs', label: 'Needs me today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'category', label: 'One category…' },
];

/** "Summarise my mail": Enyo's briefing of the chosen mail, to read or to hear. */
export function MailDigest() {
  const [scope, setScope] = useState<DigestScope>('today');
  const [category, setCategory] = useState<MailCategory>('customer');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; count: number } | null>(null);
  const [error, setError] = useState('');
  const mouth = useMemo(() => createMouthDriver(), []);
  const voice = useSpeechOutput(mouth, typeof window === 'undefined' ? '' : readPrefs().voice);

  const run = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    voice.cancel();
    try {
      const r = await summariseMyMail({ scope, category: scope === 'category' ? category : undefined });
      if (r.ok) setResult({ text: r.text, count: r.count }); else setError(r.message);
    } catch {
      setError('Enyo could not summarise your mail just now.');
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="mail-digest" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3">
      <h2 id="mail-digest" className="text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Summarise with Enyo</h2>
      <div className="mt-2 grid gap-2">
        <label htmlFor="digest-scope" className="sr-only">What to summarise</label>
        <select id="digest-scope" value={scope} onChange={(e) => setScope(e.target.value as DigestScope)} className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 text-sm text-[var(--ejo-text)]">
          {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {scope === 'category' ? (
          <>
            <label htmlFor="digest-category" className="sr-only">Category</label>
            <select id="digest-category" value={category} onChange={(e) => setCategory(e.target.value as MailCategory)} className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 text-sm text-[var(--ejo-text)]">
              {MAIL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </>
        ) : null}
        <button type="button" onClick={() => void run()} disabled={busy} className="min-h-10 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-70">
          {busy ? 'Enyo is reading…' : 'Summarise'}
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--ejo-text-muted)]">{error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--ejo-text)]">{result.text}</p>
          {voice.supported && result.count ? (
            <button type="button" onClick={() => (voice.speaking ? voice.cancel() : voice.speak(result.text))} className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">
              {voice.speaking ? 'Stop reading' : 'Listen'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
