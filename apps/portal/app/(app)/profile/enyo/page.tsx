import { currentAssist, getPrincipal } from '@/lib/authz/server';
import { BackLink, EmptyState, PageHeader } from '@/components/ui';
import { EnyoMemoryList } from '@/components/enyo/EnyoMemoryList';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 sm:p-6';

/** My Enyo memory — the short facts Enyo keeps about me, each one deletable. */
export default async function MyEnyoMemoryPage() {
  // Like the rest of the profile, this is the signed-in person's own, never shown during an assisted session.
  const assist = await currentAssist();
  if (assist) {
    return (
      <div className="w-full max-w-3xl p-4 sm:p-8">
        <section className={card}>
          <EmptyState icon="lock" title="Not available during an assisted session">
            What Enyo remembers about {assist.subject.name} is only for them. End the session to see your own.
          </EmptyState>
        </section>
      </div>
    );
  }
  await getPrincipal();
  return (
    <div className="w-full max-w-3xl p-4 sm:p-8">
      <BackLink href="/profile" label="My profile" />
      <PageHeader icon="sparkles" title="My Enyo memory" description="Short facts Enyo keeps so it can help you better, such as how you like reports set out. Delete any you do not want kept." />
      <section className={`${card} mt-6`}>
        <EnyoMemoryList />
      </section>
    </div>
  );
}
