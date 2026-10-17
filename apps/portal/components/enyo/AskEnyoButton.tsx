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
export function AskEnyoButton({ question, label = 'Ask Enyo', className, variant = 'soft' }: { question: string; label?: string; className?: string; variant?: 'soft' | 'link' }) {
  const router = useRouter();
  const go = () => {
    if (document.documentElement.dataset.enyo === 'ready') window.dispatchEvent(new CustomEvent(ENYO_ASK_EVENT, { detail: { question } }));
    else router.push(`/support/help?subject=${encodeURIComponent(question.slice(0, 150))}`);
  };
  const look = variant === 'link'
    ? 'inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ejo-primary)] hover:underline'
    : 'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/[0.06] px-3 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/[0.12]';
  return (
    <button type="button" onClick={go} className={`${look} ${className ?? ''}`}>
      <EIcon name="wand" size={14} />{label}
    </button>
  );
}
