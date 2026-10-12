'use client';

import { useEffect, useState } from 'react';
import { newRef } from '@/lib/error-ref';

/**
 * Last resort, when even the main layout failed. The app's stylesheet may be
 * what is missing, so everything this screen needs is inline: colours (light
 * and dark), layout and a gentle motion that stops for reduced-motion users.
 */
const CSS = `
:root{--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#475569;--border:#e2e8f0;--green:#16a34a;--amber:#b45309;--amber-bg:#fef3c7}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#111a2b;--text:#e2e8f0;--muted:#94a3b8;--border:#1e293b;--amber:#f59e0b;--amber-bg:rgba(245,158,11,.15)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
.orb{position:fixed;border-radius:999px;filter:blur(60px);opacity:.18;background:var(--green);animation:drift 12s ease-in-out infinite;pointer-events:none}
.card{position:relative;width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:32px 24px;text-align:center;animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.icon{width:56px;height:56px;margin:0 auto;border-radius:16px;display:flex;align-items:center;justify-content:center;background:var(--amber-bg);color:var(--amber)}
h1{font-size:1.25rem;margin:20px 0 8px}
p{margin:0;color:var(--muted);font-size:.9rem;line-height:1.55}
.ref{margin-top:20px;display:flex;gap:8px;align-items:center;justify-content:center;border:1px dashed var(--border);border-radius:10px;padding:8px 12px;font-size:.8rem;color:var(--muted)}
.ref b{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9rem;color:var(--text);letter-spacing:.05em}
.copy{border:0;background:none;color:var(--green);font-weight:600;cursor:pointer;font-size:.8rem;padding:4px 6px}
.actions{margin-top:24px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.btn{border-radius:10px;padding:9px 16px;font-size:.875rem;font-weight:600;cursor:pointer;text-decoration:none;transition:transform .15s}
.btn:hover{transform:translateY(-1px)}
.primary{background:var(--green);color:#fff;border:0}
.secondary{background:transparent;color:var(--text);border:1px solid var(--border)}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(-24px,18px)}}
@media (prefers-reduced-motion:reduce){.card,.orb{animation:none}.btn:hover{transform:none}}
`;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [ref, setRef] = useState<string | null>(error.digest ?? null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (error.digest) return;
    const r = newRef();
    setRef(r);
    fetch('/api/error-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: r, name: error.name, message: String(error.message ?? '').slice(0, 500), path: window.location.pathname }), keepalive: true }).catch(() => undefined);
  }, [error]);
  const copy = () => {
    if (!ref) return;
    navigator.clipboard?.writeText(ref).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => undefined);
  };
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong</title>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        <div className="orb" style={{ width: 260, height: 260, top: '8%', left: '-60px' }} aria-hidden="true" />
        <div className="orb" style={{ width: 300, height: 300, bottom: '6%', right: '-80px', animationDirection: 'reverse' }} aria-hidden="true" />
        <main className="card" role="alert">
          <div className="icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></svg>
          </div>
          <h1>We are having a problem right now</h1>
          <p>Nothing you entered has been lost. Please try again in a moment. If it keeps happening, contact us and quote the reference below.</p>
          {ref ? (
            <div className="ref">
              Reference: <b data-testid="error-reference">{ref}</b>
              <button type="button" className="copy" onClick={copy} aria-label="Copy reference">{copied ? 'Copied' : 'Copy'}</button>
            </div>
          ) : null}
          <div className="actions">
            {/* A full page load on purpose: this screen replaces the whole layout, so client navigation would not recover. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn secondary" href="/">Back to the home page</a>
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
