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
      case 'a': {
        // The portal's own address written in full still opens in place.
        let local: string | null = null;
        if (!n.internal && typeof window !== 'undefined') {
          try {
            const u = new URL(n.href);
            const path = `${u.pathname}${u.search}${u.hash}`;
            if (u.origin === window.location.origin && path.startsWith('/') && !path.startsWith('//')) local = path;
          } catch { /* not a URL: stays external */ }
        }
        if (local) return <Link key={i} href={local} onClick={onNavigate} className="font-medium text-[var(--ejo-primary)] underline decoration-[color-mix(in_srgb,var(--ejo-primary)_40%,transparent)] underline-offset-2 hover:decoration-[var(--ejo-primary)]">{inline(n.c, onNavigate)}</Link>;
        return n.internal ? (
          <Link key={i} href={n.href} onClick={onNavigate} className="font-medium text-[var(--ejo-primary)] underline decoration-[color-mix(in_srgb,var(--ejo-primary)_40%,transparent)] underline-offset-2 hover:decoration-[var(--ejo-primary)]">{inline(n.c, onNavigate)}</Link>
        ) : (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-[var(--ejo-primary)] underline underline-offset-2">{inline(n.c, onNavigate)}</a>
        );
      }
    }
  });
}

export function EnyoMarkdown({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2.5 break-words [overflow-wrap:anywhere]">
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i} className="whitespace-pre-line">{inline(b.c, onNavigate)}</p>;
        if (b.type === 'table') {
          const alignOf = (j: number) => (b.align[j] === 'right' ? 'text-right' : b.align[j] === 'center' ? 'text-center' : 'text-left');
          return (
            <div key={i} className="-mx-1 overflow-x-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] [overflow-wrap:normal]" role="region" aria-label="Table" tabIndex={0}>
              <table className="w-full border-collapse text-[13px] leading-snug">
                <thead className="bg-[color-mix(in_srgb,var(--ejo-primary)_7%,var(--ejo-bg))]">
                  <tr>{b.head.map((h, j) => <th key={j} scope="col" className={`whitespace-nowrap border-b border-[var(--ejo-border)] px-2.5 py-2 font-semibold text-[var(--ejo-text)] ${alignOf(j)}`}>{inline(h, onNavigate)}</th>)}</tr>
                </thead>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-[var(--ejo-border)] last:border-0 even:bg-[color-mix(in_srgb,var(--ejo-text)_3%,transparent)]">
                      {r.map((c, j) => <td key={j} className={`px-2.5 py-2 align-top text-[var(--ejo-text)] ${alignOf(j)}`}>{inline(c, onNavigate)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
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
