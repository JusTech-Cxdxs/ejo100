'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { briefMyMessage, briefMyRecentMail } from '@/lib/actions/mail';

const dots = <span className="inline-flex gap-1" aria-hidden="true"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-primary)]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-primary)] [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-primary)] [animation-delay:300ms]" /></span>;

/** Opening a message with no brief: Enyo reads it there and then (with the owner's consent). */
export function BriefNow({ messageId, auto }: { messageId: string; auto: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'failed'>(auto ? 'working' : 'idle');
  const [message, setMessage] = useState('');
  const started = useRef(false);
  const run = useCallback(async () => {
    setState('working');
    try {
      const r = await briefMyMessage(messageId);
      if (r.ok) { router.refresh(); return; }
      setMessage(r.message ?? 'Enyo could not brief this message just now.');
    } catch {
      setMessage('Enyo could not brief this message just now.');
    }
    setState('failed');
  }, [messageId, router]);
  useEffect(() => { if (auto && !started.current) { started.current = true; void run(); } }, [auto, run]);
  if (state === 'working') return <p role="status" className="mt-2 flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]">{dots}Enyo is reading this email…</p>;
  return (
    <div className="mt-2 space-y-2">
      {state === 'failed' ? <p role="alert" className="text-xs text-[var(--ejo-text-muted)]">{message}</p> : null}
      <button type="button" onClick={() => void run()} className="inline-flex min-h-10 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-xs font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">
        {state === 'failed' ? 'Try again' : 'Brief this email'}
      </button>
    </div>
  );
}

/** "Brief my recent mail": up to ten recent messages without a brief, then the page refreshes. */
export function BriefRecent() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [note, setNote] = useState('');
  const run = async () => {
    setState('working');
    try {
      const r = await briefMyRecentMail();
      setNote(r.left === -1 ? 'Please wait a few minutes before asking again.' : r.briefed ? `Briefed ${r.briefed} message${r.briefed === 1 ? '' : 's'}${r.left ? `; ${r.left} more to go — press again` : ''}.` : r.left ? 'Enyo could not brief them just now. Try again shortly.' : 'Everything recent is already briefed.');
      router.refresh();
    } catch {
      setNote('Enyo could not brief your mail just now.');
    }
    setState('done');
  };
  return (
    <div className="mt-2">
      <button type="button" disabled={state === 'working'} onClick={() => void run()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-70">
        {state === 'working' ? <>{dots}Reading your mail…</> : 'Brief my recent mail'}
      </button>
      {note ? <p role="status" className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">{note}</p> : null}
    </div>
  );
}
