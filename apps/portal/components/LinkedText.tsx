import Link from 'next/link';
import { Fragment } from 'react';
import { REFERENCE_PATTERN } from '@/lib/record-resolver';

/**
 * Renders text with every known reference number (JC-…, SV-…, VX-…, GRN-…)
 * as a link to its exact page. Numbers that could not be resolved stay as
 * plain text. `links` comes from resolveReferenceNumbers().
 */
export function LinkedText({ text, links, className }: { text: string | null | undefined; links: Map<string, string>; className?: string }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(REFERENCE_PATTERN.source, 'g'))) {
    const url = links.get(m[0]);
    if (!url) continue;
    parts.push(<Fragment key={`t${last}`}>{text.slice(last, m.index)}</Fragment>);
    parts.push(<Link key={`l${m.index}`} href={url} className="font-medium text-[var(--ejo-primary)] hover:underline">{m[0]}</Link>);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <span className={className}>{parts}</span>;
}
