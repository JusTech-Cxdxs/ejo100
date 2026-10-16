'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { newRef } from '@/lib/errors';

type Props = {
  error: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  message?: string;
  homeHref?: string;
  homeLabel?: string;
  /** Who to tell, e.g. "IT". */
  contact?: string;
  /** Inside the signed-in portal: offer "Ask for help" with the reference and page filled in. */
  helpLink?: boolean;
};

const NETWORK = /Failed to fetch|NetworkError|Load failed|fetch failed|network error|ERR_INTERNET_DISCONNECTED/i;

/**
 * The calm screen shown when a page fails. The reference is the one stored on
 * the server: Next's digest for server failures, or a new number reported to
 * /api/error-report for failures in the browser. A lost connection gets its
 * own words, and the screen notices when the connection comes back.
 */
export function ErrorScreen({ error, reset, title, message, homeHref = '/dashboard', homeLabel = 'Back to the dashboard', contact = 'IT', helpLink = false }: Props) {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(error.digest ?? null);
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [path, setPath] = useState('');
  useEffect(() => { setPath(window.location.pathname); }, []);
  const unsent = useRef<{ ref: string; name: string; message: string; path: string } | null>(null);

  // A new version of the portal was published while this tab was open: its buttons point at the old
  // version's actions. Reload once onto the new version instead of showing an error.
  useEffect(() => {
    if (!/Server Action .* was not found|failed-to-find-server-action|ChunkLoadError|Loading chunk .* failed/i.test(String(error?.message ?? ''))) return;
    try {
      const key = `ejo:reloaded:${window.location.pathname}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, String(Date.now()));
    } catch { /* storage off: reload anyway, once per render */ }
    window.location.reload();
  }, [error]);

  useEffect(() => {
    const send = () => {
      const r = unsent.current;
      if (!r || navigator.onLine === false) return;
      unsent.current = null;
      fetch('/api/error-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r), keepalive: true }).catch(() => undefined);
    };
    const lostConnection = navigator.onLine === false || (!error.digest && NETWORK.test(error.message ?? ''));
    setOffline(lostConnection);
    if (!error.digest) {
      const r = newRef();
      setRef(r);
      unsent.current = { ref: r, name: String(error.name ?? 'Error').slice(0, 100), message: String(error.message ?? '').slice(0, 500), path: window.location.pathname };
      send();
    }
    const onOnline = () => { setOffline(false); send(); };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [error]);

  const retry = () => {
    if (!reset) { window.location.reload(); return; }
    startTransition(() => { router.refresh(); reset(); });
  };

  const copy = async () => {
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(ref);
    } catch {
      const t = document.createElement('textarea');
      t.value = ref;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const heading = offline ? 'You are offline' : (title ?? 'Something went wrong on this page');
  const body = offline
    ? 'This page needs a connection. Nothing you entered has been lost. Check your Wi-Fi or mobile data, then try again.'
    : (message ?? `Nothing you entered has been lost. Please try again. If it keeps happening, tell ${contact} and quote the reference below.`);

  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-12" role="alert" aria-live="assertive">
      <div className="ejo-orb pointer-events-none absolute -left-16 top-8 h-56 w-56 rounded-full bg-[var(--ejo-primary)]/10 blur-3xl" aria-hidden="true" />
      <div className="ejo-orb ejo-orb-slow pointer-events-none absolute -right-10 bottom-4 h-64 w-64 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" aria-hidden="true" />
      <section className="ejo-rise relative w-full max-w-md rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-center shadow-sm sm:p-8">
        <span className={`relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${offline ? 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)]' : 'bg-[var(--ejo-warning)]/15 text-[#b45309] dark:text-[var(--ejo-warning)]'}`}>
          <span className="absolute inset-0 rounded-2xl bg-current opacity-10 motion-safe:animate-[ejo-glow_3.2s_ease-in-out_infinite]" aria-hidden="true" />
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {offline
              ? <><path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.5 5M5 12.5a10 10 0 0 1 3-1.9M19 12.5a10 10 0 0 0-4.2-2.2M8.5 16a5 5 0 0 1 7 0" /><path d="M12 20h.01M3 3l18 18" /></>
              : <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>}
          </svg>
        </span>
        <h1 className="mt-5 text-xl font-semibold text-[var(--ejo-text)]">{heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{body}</p>
        {ref && !offline ? (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2">
            <span className="text-xs text-[var(--ejo-text-muted)]">Reference:</span>
            <span className="font-mono text-sm font-semibold tracking-wider text-[var(--ejo-text)]" data-testid="error-reference">{ref}</span>
            <button type="button" onClick={copy} className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10" aria-label="Copy reference">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <span className="sr-only" aria-live="polite">{copied ? 'Reference copied' : ''}</span>
          </div>
        ) : null}
        {helpLink && ref && !offline ? (
          <p className="mt-3 text-sm"><Link href={`/support/help?ref=${encodeURIComponent(ref)}${path ? `&page=${encodeURIComponent(path)}` : ''}`} className="font-medium text-[var(--ejo-primary)] underline">Ask for help with this error</Link></p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row sm:gap-3">
          <Link href={homeHref} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] transition hover:-translate-y-0.5 hover:bg-[var(--ejo-bg)] motion-reduce:transform-none">{homeLabel}</Link>
          <button type="button" onClick={retry} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:opacity-90 motion-reduce:transform-none">Try again</button>
        </div>
      </section>
    </div>
  );
}
