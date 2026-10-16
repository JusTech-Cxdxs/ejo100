import { readLlmConfig } from '@ejo/enyo';
import { guardPage, myOrganisationId } from '@/lib/authz/server';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { BackLink, PageHeader } from '@/components/ui';
import { prisma } from '@ejo/database';
import { webLookupEnabled } from '@ejo/enyo';
import { EnyoSettingsForm } from '@/components/enyo/EnyoSettingsForm';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 sm:p-6';

/** Enyo settings — the organisation's switches, the model it uses, and what it can see. */
export default async function EnyoSettingsPage() {
  await guardPage('enyo.manage', '/settings/enyo');
  const orgId = await myOrganisationId();
  const settings = await getEnyoSettings(orgId);
  const learnedCount = orgId ? await prisma.enyoLearnedAnswer.count({ where: { organisationId: orgId } }).catch(() => 0) : 0;
  const routing = (process.env.ENYO_LLM_ROUTING ?? '').trim().toLowerCase() !== 'off';
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
      <section className={`${card} mt-6`} aria-labelledby="enyo-cost">
        <h2 id="enyo-cost" className="text-sm font-semibold text-[var(--ejo-text)]">Cost and learning</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Main model (records, figures, reasoning)</dt><dd className="mt-0.5 break-all font-mono text-xs text-[var(--ejo-text)]">{cfg?.model ?? '—'}</dd></div>
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Fast model (greetings, how-to, email briefs, Refine)</dt><dd className="mt-0.5 break-all font-mono text-xs text-[var(--ejo-text)]">{cfg?.fastModel ?? '—'}</dd></div>
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Choosing the cheaper model when it is enough</dt><dd className={`mt-0.5 font-medium ${routing && cfg && cfg.fastModel !== cfg.model ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-text-muted)]'}`}>{!cfg ? '—' : cfg.fastModel === cfg.model ? 'Off: set ENYO_LLM_FAST_MODEL to a smaller model' : routing ? 'On' : 'Off (ENYO_LLM_ROUTING=off)'}</dd></div>
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Answers learned from people</dt><dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{learnedCount.toLocaleString('en-NG')} <a href="/enyo/learning#learned" className="ml-1 text-xs font-medium text-[var(--ejo-primary)] hover:underline">See them</a></dd></div>
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">General knowledge from the web (Wikipedia, free)</dt><dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{webLookupEnabled() ? 'On' : 'Off (ENYO_WEB_LOOKUP=off)'}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">A question colleagues already found answered well is answered again instantly from what Enyo learned, with no model cost. Everything that reads the organisation&apos;s records always goes to the main model.</p>
      </section>

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
