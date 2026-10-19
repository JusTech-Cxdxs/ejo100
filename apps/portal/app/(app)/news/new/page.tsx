import { guardPage } from '@/lib/authz/server';
import { listNews } from '@/lib/actions/news';
import { saveNewsFormAction } from '@/lib/actions/news-form-handlers';
import { NewsEditor } from '@/components/news/NewsEditor';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { BackLink, PageHeader } from '@/components/ui';

export const metadata = { title: 'Write a story' };
export const dynamic = 'force-dynamic';

export default async function NewNewsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardPage('website.news.manage', '/news/new');
  const { error } = await searchParams;
  const { areas, websiteUrl } = await listNews();
  return (
    <div className="w-full p-4 sm:p-8">
      <BackLink href="/news" label="News & media" />
      <PageHeader icon="megaphone" title="Write a story" description="Save it as a draft to come back to, or publish it straight to the website." />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <NewsEditor areas={areas} action={saveNewsFormAction} websiteUrl={websiteUrl} />
    </div>
  );
}
