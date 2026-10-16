'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncMyMailbox } from '@/lib/actions/mail';
import { Icon } from '@/components/ui';

type State = { kind: 'idle' | 'busy' | 'done' | 'error'; text: string };

/**
 * Fetches new mail when the Mail page opens (the server skips it if it ran
 * in the last minute) and on Refresh. New messages appear without a page
 * reload. The status line is announced politely to screen readers.
 */
export function MailSync({ lastSync, auto = true }: { lastSync: string | null; auto?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle', text: lastSync ? `Last checked ${lastSync}` : 'Not checked yet' });
  const running = useRef(false);

  const run = useCallback(async (reason: 'open' | 'refresh') => {
    if (running.current) return;
    running.current = true;
    setState({ kind: 'busy', text: 'Checking for new mail…' });
    try {
      const r = await syncMyMailbox(reason);
      window.dispatchEvent(new Event('ejo:mail-changed'));
      if (r.status === 'error') setState({ kind: 'error', text: r.message ?? 'The mailbox could not be read just now.' });
      else if (r.status === 'synced') setState({ kind: 'done', text: r.added ? `${r.added} new ${r.added === 1 ? 'message' : 'messages'}` : 'Up to date' });
      else setState({ kind: 'done', text: reason === 'refresh' ? 'Checked a moment ago — up to date' : 'Up to date' });
      if (r.status === 'synced' || r.status === 'error') router.refresh();
    } catch {
      setState({ kind: 'error', text: 'Could not check for new mail. Please try again.' });
    } finally {
      running.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (auto) void run('open');
  }, [auto, run]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p aria-live="polite" className={`text-xs ${state.kind === 'error' ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>{state.text}</p>
      <button
        type="button"
        onClick={() => void run('refresh')}
        disabled={state.kind === 'busy'}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-xs font-medium text-[var(--ejo-text)] transition-colors hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)] disabled:opacity-60"
      >
        <span className={state.kind === 'busy' ? 'animate-spin motion-reduce:animate-none' : ''}><Icon name="restore" size={14} /></span>
        Refresh
      </button>
    </div>
  );
}
