import type { ReactNode } from 'react';
import { parseArticle, type ArticleBlock, type ArticleInline } from './article';

/**
 * Renders an article's Markdown (packages/ui/src/article.ts) as elements —
 * never HTML. Classes are Tailwind utilities on the design tokens both apps
 * share; `linkElement` lets the host app use its router for internal links.
 */
export type LinkRenderer = (href: string, children: ReactNode, key: string) => ReactNode;

const defaultLink: LinkRenderer = (href, children, key) =>
  href.startsWith('/') ? <a key={key} href={href} className="font-medium text-[var(--ejo-primary)] underline decoration-[var(--ejo-primary)]/40 underline-offset-[3px] hover:decoration-[var(--ejo-primary)]">{children}</a>
    : <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--ejo-primary)] underline decoration-[var(--ejo-primary)]/40 underline-offset-[3px] hover:decoration-[var(--ejo-primary)]">{children}</a>;

function inlines(c: ArticleInline[], link: LinkRenderer, key = ''): ReactNode[] {
  return c.map((x, i) => {
    const k = `${key}${i}`;
    switch (x.t) {
      case 'text': return x.v;
      case 'br': return <br key={k} />;
      case 'code': return <code key={k} className="rounded bg-[var(--ejo-surface-alt)] px-1 py-0.5 text-[0.9em]">{x.v}</code>;
      case 'strong': return <strong key={k} className="font-semibold text-[var(--ejo-text)]">{inlines(x.c, link, `${k}.`)}</strong>;
      case 'em': return <em key={k}>{inlines(x.c, link, `${k}.`)}</em>;
      case 'link': return link(x.href, inlines(x.c, link, `${k}.`), k);
    }
  });
}

export function ArticleBody({ markdown, blocks, linkElement, className = '' }: { markdown?: string; blocks?: ArticleBlock[]; linkElement?: LinkRenderer; className?: string }) {
  const link = linkElement ?? defaultLink;
  const bs = blocks ?? parseArticle(markdown ?? '');
  return (
    <div className={`text-[1.0625rem] leading-[1.75] text-[var(--ejo-text)] [overflow-wrap:anywhere] ${className}`}>
      {bs.map((b, i) => {
        switch (b.t) {
          case 'h': return b.level === 2
            ? <h2 key={i} id={b.id} className="mb-3 mt-10 scroll-mt-28 text-2xl font-bold leading-tight tracking-[-0.01em] first:mt-0">{inlines(b.c, link, `${i}.`)}</h2>
            : <h3 key={i} id={b.id} className="mb-2 mt-7 scroll-mt-28 text-lg font-semibold leading-snug">{inlines(b.c, link, `${i}.`)}</h3>;
          case 'p': return <p key={i} className="my-4">{inlines(b.c, link, `${i}.`)}</p>;
          case 'quote': return <blockquote key={i} className="my-6 border-l-[3px] border-[var(--ejo-primary)] pl-5 text-xl font-medium leading-snug text-[var(--ejo-text)]">{inlines(b.c, link, `${i}.`)}</blockquote>;
          case 'img': return (
            <figure key={i} className="my-7">
              {/* eslint-disable-next-line @next/next/no-img-element -- an address the team pasted; sizes unknown */}
              <img src={b.src} alt={b.alt} loading="lazy" className="w-full rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-surface)]" />
              {b.caption ? <figcaption className="mt-2 text-sm text-[var(--ejo-text-muted)]">{b.caption}</figcaption> : null}
            </figure>
          );
          case 'ul': return <ul key={i} className="my-4 list-disc space-y-1.5 pl-6 marker:text-[var(--ejo-primary)]">{b.items.map((it, j) => <li key={j}>{inlines(it, link, `${i}.${j}.`)}</li>)}</ul>;
          case 'ol': return <ol key={i} start={b.start} className="my-4 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-[var(--ejo-primary)]">{b.items.map((it, j) => <li key={j}>{inlines(it, link, `${i}.${j}.`)}</li>)}</ol>;
          case 'hr': return <hr key={i} className="my-8 border-[var(--ejo-border)]" />;
        }
      })}
    </div>
  );
}
