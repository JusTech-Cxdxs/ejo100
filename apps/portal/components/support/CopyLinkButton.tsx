'use client';

import { useState } from 'react';

/** Copies a link for pasting into a reply ("Copied" for two seconds). */
export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={url}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt('Copy this link', url);
        }
      }}
      className="inline-flex min-h-8 items-center rounded-full px-2 text-[11px] font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10"
    >
      {done ? 'Copied' : label}
    </button>
  );
}
