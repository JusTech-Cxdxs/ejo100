import { currentAssist } from '@/lib/authz/server';
import { listColleaguesForSpeakUp } from '@/lib/actions/integrity';
import { PageHeader, SectionCard, EmptyState } from '@/components/ui';
import { SpeakUpForm } from '@/components/SpeakUpForm';

export const metadata = { title: 'Speak up' };
export const dynamic = 'force-dynamic';

/** Speak up: any colleague can raise a concern about wrongdoing, safely — to the organisation's reviewers only. */
export default async function SpeakUpPage() {
  if (await currentAssist()) {
    return <div className="w-full max-w-3xl p-4 sm:p-8"><PageHeader icon="shield" title="Speak up" /><EmptyState icon="lock" title="Not during an assisted session">A concern is raised by the person themselves. End the session first.</EmptyState></div>;
  }
  const colleagues = await listColleaguesForSpeakUp();
  return (
    <div className="w-full max-w-3xl p-4 sm:p-8">
      <PageHeader icon="shield" title="Speak up" description="Seen something that looks wrong — money, parts, a vehicle leaving, someone misusing access? Tell the organisation’s reviewers. You can stay anonymous. Raising a concern in good faith is always the right thing to do." />
      <SectionCard icon="shield" title="Raise a concern">
        <SpeakUpForm colleagues={colleagues} />
      </SectionCard>
      <p className="mt-4 text-xs leading-relaxed text-[var(--ejo-text-muted)]">Only reviewers of the integrity watch read concerns. A concern is a reason to look, not a finding against anyone; nothing is decided automatically. For danger to people, call security or the emergency services first.</p>
    </div>
  );
}
