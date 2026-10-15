import Link from 'next/link';
import type { ReactNode } from 'react';
import { parseMarkdown, type Inline } from '@/lib/enyo/markdown';

/**
 * Renders an Enyo answer from the safe Markdown subset (lib/enyo/markdown.ts)
 * as React elements. No HTML is ever injected; links are only this site's
 * own paths (opened in place) or https addresses (a new tab, no referrer).
 */
function inlines(c: Inline[], key = ''): ReactNode[] {
  return c.map((x, i) => {
    const k = `${key}${i}`;
    switch (x.t) {
      case 'text': return x.v;
      case 'br': return <br key={k} />;
      case 'code': return <code key={k} className="rounded bg-[var(--ejo-surface-alt)] px-1 py-0.5 text-[0.9em]">{x.v}</code>;
      case 'strong': return <strong key={k} className="font-semibold text-[var(--ejo-text)]">{inlines(x.c, `${k}.`)}</strong>;
      case 'em': return <em key={k}>{inlines(x.c, `${k}.`)}</em>;
      case 'link':
        return x.href.startsWith('/') ? (
          <Link key={k} href={x.href} className="font-medium text-[var(--ejo-primary)] underline decoration-[var(--ejo-primary)]/40 underline-offset-2 hover:decoration-[var(--ejo-primary)]">{inlines(x.c, `${k}.`)}</Link>
        ) : (
          <a key={k} href={x.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-[var(--ejo-primary)] underline decoration-[var(--ejo-primary)]/40 underline-offset-2 hover:decoration-[var(--ejo-primary)]">{inlines(x.c, `${k}.`)}</a>
        );
    }
  });
}

export function EnyoMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2 break-words [overflow-wrap:anywhere]">
      {blocks.map((b, i) => {
        if (b.t === 'table') {
          const al = (j: number) => (b.align[j] === 'right' ? 'text-right' : b.align[j] === 'center' ? 'text-center' : 'text-left');
          return (
            <div key={i} className="overflow-x-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] [overflow-wrap:normal]" role="region" aria-label="Table" tabIndex={0}>
              <table className="w-full border-collapse text-[13px] leading-snug">
                <thead className="bg-[var(--ejo-surface)]"><tr>{b.head.map((h, j) => <th key={j} scope="col" className={`whitespace-nowrap border-b border-[var(--ejo-border)] px-2.5 py-2 font-semibold ${al(j)}`}>{inlines(h, `${i}.h${j}.`)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, ri) => <tr key={ri} className="border-b border-[var(--ejo-border)] last:border-0">{r.map((c, j) => <td key={j} className={`px-2.5 py-2 align-top ${al(j)}`}>{inlines(c, `${i}.${ri}.${j}.`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        if (b.t === 'p') return <p key={i}>{inlines(b.c, `${i}.`)}</p>;
        if (b.t === 'ul') return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{inlines(it, `${i}.${j}.`)}</li>)}</ul>;
        return <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{inlines(it, `${i}.${j}.`)}</li>)}</ol>;
      })}
    </div>
  );
}
