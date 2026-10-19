'use client';

import { useMemo, useState } from 'react';
import { ArticleBody } from '@ejo/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { LoadingLink } from '@/components/LoadingLink';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABEL, readingMinutes, slugify } from '@/lib/news/core';
import type { NewsRow } from '@/lib/actions/news';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * Write a story: the form on the left, the website's rendering on the right
 * (the same renderer the website uses), updated as you type. Saving keeps a
 * draft; "Publish" saves and puts it on the website at once.
 */
export function NewsEditor({ row, areas, action, websiteUrl }: { row?: NewsRow; areas: string[]; action: (f: FormData) => Promise<void>; websiteUrl: string | null }) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [slug, setSlug] = useState(row?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(row));
  const [summary, setSummary] = useState(row?.summary ?? '');
  const [body, setBody] = useState(row?.body ?? '');
  const [cover, setCover] = useState(row?.coverImageUrl ?? '');
  const [preview, setPreview] = useState(false);
  const address = slugTouched ? slug : slugify(title);
  const minutes = useMemo(() => readingMinutes(body), [body]);
  const day = row?.publishedAt ? new Date(row.publishedAt).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) : '';
  const bodyId = `body-${row?.id ?? 'new'}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form action={action} className="relative space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <FormPendingOverlay />
        {row ? <input type="hidden" name="id" value={row.id} /> : null}
        <div>
          <label htmlFor="title" className={label}>Headline</label>
          <input id="title" name="title" required minLength={6} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} text-base font-semibold`} autoComplete="off" placeholder="SOUEAST passenger-vehicle assembly begins in Lagos" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className={label}>Kind of story</label>
            <select id="category" name="category" defaultValue={row?.category ?? 'NEWS'} className={input}>
              {NEWS_CATEGORIES.map((c) => <option key={c} value={c}>{NEWS_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="businessArea" className={label}>Business it is about</label>
            <input id="businessArea" name="businessArea" list="news-areas" maxLength={60} defaultValue={row?.businessArea ?? ''} className={input} placeholder="Automotive" autoComplete="off" />
            <datalist id="news-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
        </div>
        <div>
          <label htmlFor="summary" className={label}>Summary — one or two sentences</label>
          <textarea id="summary" name="summary" required minLength={20} maxLength={320} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} className={input} placeholder="What happened, in plain words. Shown on the home page and in search results." />
          <div className="mt-1 flex items-center justify-between gap-2"><RefineTextButton targetId="summary" label="summary" /><span className="text-xs text-[var(--ejo-text-muted)]">{summary.length}/320</span></div>
        </div>
        <div>
          <label htmlFor={bodyId} className={label}>The story</label>
          <textarea id={bodyId} name="body" required minLength={40} maxLength={20000} rows={16} value={body} onChange={(e) => setBody(e.target.value)} className={`${input} font-mono text-[13px] leading-relaxed`} placeholder={'Write it as you would tell it.\n\n## A heading\nA paragraph. **Bold**, *italic*, [a link](https://…).\n\n- A list\n- of points\n\n> A quote from the Managing Director.\n\n![A picture](https://… "Caption")'} />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <RefineTextButton targetId={bodyId} label="story" />
            <span className="text-xs text-[var(--ejo-text-muted)]">About {minutes} min read · Markdown: ## headings, lists, **bold**, [links](https://…), &gt; quotes, ![pictures](https://…)</span>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="coverImageUrl" className={label}>Cover picture (https:// address, optional)</label>
            <input id="coverImageUrl" name="coverImageUrl" type="url" inputMode="url" maxLength={500} value={cover} onChange={(e) => setCover(e.target.value)} className={input} placeholder="https://…/assembly-line.jpg" />
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">A picture already hosted online (the organisation&apos;s own storage). Without one, the website shows a themed cover.</p>
          </div>
          <div>
            <label htmlFor="coverAlt" className={label}>Describe the picture (for screen readers)</label>
            <input id="coverAlt" name="coverAlt" maxLength={160} defaultValue={row?.coverAlt ?? ''} className={input} placeholder="Technicians fitting a bonnet on the new assembly line" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="publishedAt" className={label}>Date of the story</label>
            <input id="publishedAt" name="publishedAt" type="date" defaultValue={day} className={input} />
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Empty: the day it is published.</p>
          </div>
          <div>
            <label htmlFor="authorName" className={label}>By (optional)</label>
            <input id="authorName" name="authorName" maxLength={80} defaultValue={row?.authorName ?? ''} className={input} placeholder="Corporate Communications" />
          </div>
          <div>
            <label htmlFor="slug" className={label}>Web address</label>
            <input id="slug" name="slug" maxLength={80} value={address} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} className={`${input} font-mono text-xs`} spellCheck={false} />
            <p className="mt-1 truncate text-xs text-[var(--ejo-text-muted)]">{websiteUrl ?? ''}/news/{address || '…'}</p>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-[var(--ejo-text)]">
          <input type="checkbox" name="isFeatured" defaultChecked={row?.isFeatured ?? false} className="mt-0.5 h-4 w-4 accent-[var(--ejo-primary)]" />
          <span>Feature this story<span className="block text-xs text-[var(--ejo-text-muted)]">Shown first on the home page and at the top of News. Only one story is featured at a time.</span></span>
        </label>
        <div className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-4">
          <SubmitButton label={row ? 'Save changes' : 'Save draft'} pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90" />
          {row?.status !== 'PUBLISHED' ? <SubmitButton name="then" value="publish" label={row ? 'Save and publish' : 'Publish now'} pendingLabel="Publishing…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10" /> : null}
          <button type="button" onClick={() => setPreview((v) => !v)} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] xl:hidden">{preview ? 'Hide preview' : 'Preview'}</button>
          <LoadingLink href="/news" className="inline-flex items-center rounded-[var(--ejo-radius-md)] px-4 py-2 text-sm font-medium text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]">Back to the list</LoadingLink>
        </div>
      </form>

      <aside className={`${preview ? 'block' : 'hidden'} xl:block`} aria-label="How it will look on the website">
        <div className="sticky top-20 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)]">
          <div className="border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-2 text-xs font-medium text-[var(--ejo-text-muted)]">On the website</div>
          <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-8">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- an address the team pasted
              <img src={cover} alt="" className="mb-6 aspect-[16/9] w-full rounded-[var(--ejo-radius-lg)] object-cover" />
            ) : (
              <div className="mb-6 aspect-[16/9] w-full rounded-[var(--ejo-radius-lg)] bg-[linear-gradient(135deg,var(--ejo-primary),#0f2a1c)]" />
            )}
            <h1 className="text-3xl font-bold leading-tight tracking-[-0.015em] text-[var(--ejo-text)]">{title || 'Headline'}</h1>
            <p className="mt-3 text-lg text-[var(--ejo-text-muted)]">{summary || 'Summary'}</p>
            <hr className="my-6 border-[var(--ejo-border)]" />
            {body ? <ArticleBody markdown={body} /> : <p className="text-sm text-[var(--ejo-text-muted)]">The story appears here as you write.</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}
