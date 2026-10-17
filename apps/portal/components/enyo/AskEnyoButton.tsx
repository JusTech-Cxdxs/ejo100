'use client';

import { useRouter } from 'next/navigation';
import { ENYO_ASK_EVENT } from './ask-event';
import { EIcon } from './icons';

/**
 * "Ask Enyo" anywhere: opens the assistant with a question ready in the box
 * (the person sends or changes it). When Enyo is not switched on for them,
 * it opens Get help with the question as the subject instead — a question
 * always has somewhere to go.
 */
export function AskEnyoButton({ question, label = 'Ask Enyo', className, variant = 'soft', send = false, speak = false, icon = 'wand' }: { question: string; label?: string; className?: string; variant?: 'soft' | 'link' | 'solid'; /** Ask straight away (a briefing). */ send?: boolean; /** Read the answer aloud. */ speak?: boolean; icon?: 'wand' | 'speaker' }) {
  const router = useRouter();
  const go = () => {
    if (document.documentElement.dataset.enyo === 'ready') window.dispatchEvent(new CustomEvent(ENYO_ASK_EVENT, { detail: { question, send, speak } }));
    else router.push(`/support/help?subject=${encodeURIComponent(question.slice(0, 150))}`);
  };
  const look = variant === 'link'
    ? 'inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ejo-primary)] hover:underline'
    : variant === 'solid'
    ? 'inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-semibold text-white hover:brightness-110'
    : 'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/[0.06] px-3 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/[0.12]';
  return (
    <button type="button" onClick={go} className={`${look} ${className ?? ''}`}>
      <EIcon name={icon} size={14} />{label}
    </button>
  );
}
