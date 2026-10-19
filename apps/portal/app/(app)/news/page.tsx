import { guardPage } from '@/lib/authz/server';
import { listNews } from '@/lib/actions/news';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { EmptyState, Icon, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { NEWS_CATEGORY_LABEL, NEWS_STATUS_LABEL, type NewsStatusKey } from '@/lib/news/core';
import { formatDateOnly, formatRelative } from '@/lib/utils/format-date';

export const metadata = { title: 'News & media' };
export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = { deleted: 'Draft deleted.' };
const TONE: Record<NewsStatusKey, 'success' | 'neutral' | 'warning'> = { PUBLISHED: 'success', DRAFT: 'warning', ARCHIVED: 'neutral' };

/**
 * News & media: what the communications team publishes on the public
 * website — stories, milestones, press releases, events and community
 * programmes. Drafts are private; published stories appear on the website
 * at once; archived ones come off it but stay on record.
 */
export default async function NewsListPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('website.news.manage', '/news');
  const { status, error } = await searchParams;
  const { rows, websiteUrl } = await listNews();
  const groups: { key: NewsStatusKey; title: string; hint: string }[] = [
    { key: 'DRAFT', title: 'Drafts', hint: 'Only visible here until published.' },
    { key: 'PUBLISHED', title: 'On the website', hint: 'Newest first, as the website shows them.' },
    { key: 'ARCHIVED', title: 'Archived', hint: 'Taken off the website; kept on record.' },
  ];
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        icon="megaphone"
        title="News & media"
        description={`What the organisation publishes on its website${websiteUrl ? ` (${websiteUrl.replace(/^https?:\/\//, '')}/news)` : ''}: stories, milestones, press releases, events and community programmes.`}
        actions={<LoadingLink href="/news/new" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white hover:opacity-90"><Icon name="plus" size={16} />Write a story</LoadingLink>}
      />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {rows.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <EmptyState icon="megaphone" title="Nothing published yet.">Write the first story — a milestone, a new partnership, an event. It goes on the website the moment you press Publish.</EmptyState>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const list = rows.filter((r) => r.status === g.key);
            if (!list.length) return null;
            return (
              <SectionCard key={g.key} icon={g.key === 'PUBLISHED' ? 'globe' : g.key === 'DRAFT' ? 'file' : 'history'} title={<>{g.title} <span className="ml-1 rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs text-[var(--ejo-text-muted)] ring-1 ring-[var(--ejo-border)]">{list.length}</span></>} description={g.hint} flush>
                <ul className="divide-y divide-[var(--ejo-border)]">
                  {list.map((r) => (
                    <li key={r.id}>
                      <LoadingLink href={`/news/${r.id}`} className="group flex items-start gap-4 px-4 py-3.5 hover:bg-[var(--ejo-bg)]">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">{r.title}</span>
                            {r.isFeatured ? <StatusChip tone="brand" label="Featured" /> : null}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-sm text-[var(--ejo-text-muted)]">{r.summary}</p>
                          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{NEWS_CATEGORY_LABEL[r.category]}{r.businessArea ? ` · ${r.businessArea}` : ''} · {r.publishedAt ? formatDateOnly(r.publishedAt) : `edited ${formatRelative(r.updatedAt)}`}{r.authorName ? ` · ${r.authorName}` : ''}</p>
                        </div>
                        <StatusChip tone={TONE[r.status]} label={NEWS_STATUS_LABEL[r.status]} className="mt-0.5 shrink-0" />
                      </LoadingLink>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
