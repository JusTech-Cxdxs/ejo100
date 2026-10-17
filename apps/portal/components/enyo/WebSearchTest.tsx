'use client';

import { useState } from 'react';
import { testWebSearch, type WebSearchTestResult } from '@/lib/actions/enyo';

/** "Test the web search": one search for the organisation's name from the server, with what came back. */
export function WebSearchTest() {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<WebSearchTestResult | null>(null);
  return (
    <div className="mt-3">
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); setR(null); try { setR(await testWebSearch()); } catch { setR({ ok: false, message: 'The test could not run. Please try again.' }); } setBusy(false); }}
        className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50 disabled:opacity-50">
        {busy ? 'Searching…' : 'Test the web search'}
      </button>
      {r ? (
        <p role={r.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${r.ok ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>
          {r.ok ? `Working: ${r.found} ${r.found === 1 ? 'result' : 'results'} from ${r.source}${r.sites.length ? ` (${r.sites.join(', ')})` : ''}, and ${r.wikipedia} from Wikipedia.` : r.message}
        </p>
      ) : null}
    </div>
  );
}
