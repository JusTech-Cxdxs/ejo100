import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getNews, listNews } from '@/lib/actions/news';
import { deleteNewsFormAction, newsStatusFormAction, publishNewsFormAction, saveNewsFormAction } from '@/lib/actions/news-form-handlers';
import { NewsEditor } from '@/components/news/NewsEditor';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { BackLink, PageHeader, StatusChip } from '@/components/ui';
import { NEWS_STATUS_LABEL } from '@/lib/news/core';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'Edit story' };
export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = {
  saved: 'Saved.', published: 'Published — it is on the website now.', draft: 'Taken off the website and kept as a draft.', archived: 'Archived — off the website, kept on record.',
};
const line = 'inline-flex min-h-10 items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';

export default async function EditNewsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  await guardPage('website.news.manage', `/news/${id}`);
  const { status, error } = await searchParams;
  const [row, { areas, websiteUrl }] = await Promise.all([getNews(id), listNews()]);
  if (!row) notFound();
  const tone = row.status === 'PUBLISHED' ? 'success' : row.status === 'DRAFT' ? 'warning' : 'neutral';
  return (
    <div className="w-full p-4 sm:p-8">
      <BackLink href="/news" label="News & media" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader icon="megaphone" title={row.title} description={<>{row.publishedAt ? `Dated ${formatDateTime(row.publishedAt)}` : 'Not yet dated'} · last edited {formatDateTime(row.updatedAt)}</>} />
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={tone} label={NEWS_STATUS_LABEL[row.status]} />
          {row.status === 'PUBLISHED' && websiteUrl ? <a href={`${websiteUrl}/news/${row.slug}`} target="_blank" rel="noopener noreferrer" className={line}>Open on the website ↗</a> : null}
          {row.status === 'PUBLISHED' ? (
            <>
              <form action={newsStatusFormAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="DRAFT" /><SubmitButton label="Take off the website" pendingLabel="Working…" className={line} /></form>
              <form action={newsStatusFormAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="ARCHIVED" /><SubmitButton label="Archive" pendingLabel="Working…" className={line} /></form>
            </>
          ) : row.status === 'ARCHIVED' ? (
            <form action={newsStatusFormAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="status" value="PUBLISHED" /><SubmitButton label="Publish again" pendingLabel="Working…" className={line} /></form>
          ) : (
            <form action={deleteNewsFormAction}><input type="hidden" name="id" value={row.id} /><ConfirmDeleteButton confirmMessage="Delete this draft? It has never been published, so nothing is kept." label="Delete draft" className={`${line} text-[var(--ejo-error)]`} /></form>
          )}
        </div>
      </div>
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <NewsEditor row={row} areas={areas} action={saveNewsFormAction} publishAction={publishNewsFormAction} websiteUrl={websiteUrl} />
    </div>
  );
}
