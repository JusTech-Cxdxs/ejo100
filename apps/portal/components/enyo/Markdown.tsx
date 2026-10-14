'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Inline } from '@/lib/enyo/markdown';

/**
 * Renders an answer from the safe Markdown subset (lib/enyo/markdown.ts).
 * Everything becomes React text nodes: HTML in an answer shows as text.
 * Portal links open in place; https links open in a new tab.
 */
function inline(nodes: Inline[], onNavigate?: () => void): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text': return <Fragment key={i}>{n.v}</Fragment>;
      case 'b': return <strong key={i} className="font-semibold text-[var(--ejo-text)]">{inline(n.c, onNavigate)}</strong>;
      case 'i': return <em key={i}>{inline(n.c, onNavigate)}</em>;
      case 'code': return <code key={i} className="rounded bg-[color-mix(in_srgb,var(--ejo-text)_7%,transparent)] px-1 py-px text-[0.92em]">{n.v}</code>;
      case 'a':
        return n.internal ? (
          <Link key={i} href={n.href} onClick={onNavigate} className="font-medium text-[var(--ejo-primary)] underline decoration-[color-mix(in_srgb,var(--ejo-primary)_40%,transparent)] underline-offset-2 hover:decoration-[var(--ejo-primary)]">{inline(n.c, onNavigate)}</Link>
        ) : (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-[var(--ejo-primary)] underline underline-offset-2">{inline(n.c, onNavigate)}</a>
        );
    }
  });
}

export function EnyoMarkdown({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2.5 break-words [overflow-wrap:anywhere]">
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i} className="whitespace-pre-line">{inline(b.c, onNavigate)}</p>;
        if (b.type === 'h') return <p key={i} className="font-semibold text-[var(--ejo-text)]">{inline(b.c, onNavigate)}</p>;
        if (b.type === 'ul') {
          return (
            <ul key={i} className="space-y-1 pl-5 [list-style:disc] marker:text-[var(--ejo-primary)]">
              {b.items.map((it, j) => <li key={j}>{inline(it, onNavigate)}</li>)}
            </ul>
          );
        }
        return (
          <ol key={i} start={b.start} className="space-y-1 pl-5 [list-style:decimal] marker:text-[var(--ejo-text-muted)]">
            {b.items.map((it, j) => <li key={j}>{inline(it, onNavigate)}</li>)}
          </ol>
        );
      })}
    </div>
  );
}
