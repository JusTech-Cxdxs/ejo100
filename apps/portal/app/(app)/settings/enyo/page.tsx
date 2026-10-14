import { readLlmConfig } from '@ejo/enyo';
import { guardPage, myOrganisationId } from '@/lib/authz/server';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { BackLink, PageHeader } from '@/components/ui';
import { EnyoSettingsForm } from '@/components/enyo/EnyoSettingsForm';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 sm:p-6';

/** Enyo settings — the organisation's switches, the model it uses, and what it can see. */
export default async function EnyoSettingsPage() {
  await guardPage('enyo.manage', '/settings/enyo');
  const settings = await getEnyoSettings(await myOrganisationId());
  const cfg = readLlmConfig();
  // Only the label and model name reach the page: never the address or the key.
  const provider = cfg ? { configured: true, label: cfg.providerLabel, model: cfg.model } : { configured: false };
  return (
    <div className="w-full max-w-3xl p-4 sm:p-8">
      <BackLink href="/settings" label="Settings" />
      <PageHeader icon="sparkles" title="Enyo" description="The assistant built into the portal: what is switched on, and the language model it uses." />
      <div className="mt-6">
        <EnyoSettingsForm initial={settings} provider={provider} />
      </div>
      <section className={`${card} mt-6`} aria-labelledby="enyo-data">
        <h2 id="enyo-data" className="text-sm font-semibold text-[var(--ejo-text)]">Your data</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ejo-text)]">
          <li>Enyo sees exactly what the person asking can see. It works as that person, through the same permission checks as every page, so a technician&apos;s Enyo cannot read the finance figures.</li>
          <li>Questions and answers are kept for 12 months (website chats for 90 days) so people can come back to them, then deleted.</li>
          <li>Nothing leaves the portal except the question and the records needed to answer it, sent to the language model set up above. Passwords and keys are never sent.</li>
          <li>Enyo never saves or sends anything by itself. When it prepares a reminder, a reply or a form, the person reviews it and presses the normal button.</li>
          <li>Each person can see and delete what Enyo remembers about them on their profile.</li>
        </ul>
      </section>
    </div>
  );
}
