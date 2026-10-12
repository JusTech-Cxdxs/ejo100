'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { endAssistSession } from '@/lib/actions/assist';
import { Icon } from '@/components/ui/Icon';

const timeInLagos = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date(iso));

/**
 * Shown on every page while a Branch Assistant works on a colleague's behalf.
 * High contrast on purpose: nobody should forget whose account they are in.
 */
export function AssistBanner({ colleague, role, expiresAt }: { colleague: string; role: string; expiresAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = colleague.split(/\s+/)[0] || colleague;

  // When the time runs out the server stops honouring the session; refresh so the page shows it.
  useEffect(() => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    const t = setTimeout(() => router.refresh(), Math.max(1000, Math.min(ms + 1000, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [expiresAt, router]);

  function end() {
    setError(null);
    start(async () => {
      try {
        await endAssistSession();
        router.push('/support/assist?ended=1');
        router.refresh();
      } catch {
        setError('The session could not be ended. Try again.');
      }
    });
  }

  return (
    <section
      role="region"
      aria-label="Assisted session"
      className="relative z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-amber-700 bg-amber-400 px-3 py-2.5 text-slate-950 sm:px-5"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-amber-300" aria-hidden="true">
        <Icon name="user-plus" size={16} />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <strong className="font-semibold">You are helping {colleague} ({role}).</strong>{' '}
        Everything you do is recorded as done for {first}, with you as the assistant.{' '}
        <span className="whitespace-nowrap font-medium">Ends at {timeInLagos(expiresAt)}.</span>
        {error ? <span className="ml-2 font-semibold text-red-900">{error}</span> : null}
      </p>
      <button
        type="button"
        onClick={end}
        disabled={pending}
        className="shrink-0 rounded-[var(--ejo-radius-md)] bg-slate-950 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:opacity-70"
      >
        {pending ? 'Ending…' : 'End session'}
      </button>
    </section>
  );
}
