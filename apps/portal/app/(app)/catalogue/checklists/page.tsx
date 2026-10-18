import { allows, guardAnyPage } from '@/lib/authz/server';
import { listCheckTemplates } from '@/lib/actions/catalogue';
import { addCheckTemplateFormAction, moveCheckTemplateFormAction, retireCheckTemplateFormAction } from '@/lib/actions/catalogue-form-handlers';
import { FAMILIES, FAMILY_LABEL, type ProductFamilyCode } from '@/lib/catalogue-core';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { EmptyState, PageHeader, RevealPanel, SectionCard } from '@/components/ui';
import { btn, btnSmall, chipLink, input, label } from '@/components/production/styles';

const STAGE_LABEL = { LINE_CHECK: 'Line supervisor check', QA: 'QA test' } as const;
const BANNER: Record<string, string> = { check_added: 'Check item added.', check_moved: 'Check item moved.', check_retired: 'Check item retired.' };

/** The checklist items per family and stage: what the line supervisor confirms, what QA tests. */
export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ stage?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['catalogue.view'], '/catalogue/checklists');
  const { stage: rawStage, status, error } = await searchParams;
  const stage: 'LINE_CHECK' | 'QA' = rawStage === 'QA' ? 'QA' : 'LINE_CHECK';
  const [rows, canManage] = await Promise.all([listCheckTemplates(), allows('catalogue.manage')]);
  const ofStage = rows.filter((r: (typeof rows)[number]) => r.stage === stage);
  const groups: { family: ProductFamilyCode | null; label: string; items: typeof ofStage }[] = [
    { family: null, label: 'Every family', items: ofStage.filter((r: (typeof rows)[number]) => r.family === null) },
    ...FAMILIES.map((f: ProductFamilyCode) => ({ family: f, label: FAMILY_LABEL[f], items: ofStage.filter((r: (typeof rows)[number]) => r.family === f) })).filter((g) => g.items.length > 0),
  ];
  const chip = (active: boolean) => `${chipLink} ${active ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]'}`;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="clipboard" title="Checklists" back={{ href: '/catalogue', label: 'Back to Catalogue' }} description="What the line supervisor confirms before QA, and what QA tests, per product family. Items for “every family” apply to all products; family items are added to them." />
      {status && BANNER[status] ? <FormFeedbackBanner kind="success" message={BANNER[status]} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-4 flex gap-2">
        <LoadingLink href="/catalogue/checklists?stage=LINE_CHECK" className={chip(stage === 'LINE_CHECK')} aria-current={stage === 'LINE_CHECK' ? 'true' : undefined}>{STAGE_LABEL.LINE_CHECK} ({rows.filter((r: (typeof rows)[number]) => r.stage === 'LINE_CHECK').length})</LoadingLink>
        <LoadingLink href="/catalogue/checklists?stage=QA" className={chip(stage === 'QA')} aria-current={stage === 'QA' ? 'true' : undefined}>{STAGE_LABEL.QA} ({rows.filter((r: (typeof rows)[number]) => r.stage === 'QA').length})</LoadingLink>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {ofStage.length === 0 ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <EmptyState icon="clipboard" title={`No ${STAGE_LABEL[stage].toLowerCase()} items yet`}>
                {canManage ? 'Add the items the line works through — e.g. RAM seated, SSD fitted, keyboard layout, BIOS version, OS activation, packages present, labels, accessories in box.' : 'Until items are added, units pass this stage without a checklist.'}
              </EmptyState>
            </div>
          ) : (
            groups.map((g) => (
              <SectionCard key={g.family ?? 'all'} icon="check-circle" title={g.label} description={g.family === null ? 'Checked on every product.' : `Checked on ${g.label.toLowerCase()} only, after the items for every family.`}>
                <ol className="divide-y divide-[var(--ejo-border)]">
                  {g.items.map((t: (typeof rows)[number], i: number) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span><span className="mr-2 tabular-nums text-[var(--ejo-text-muted)]">{i + 1}.</span>{t.item}</span>
                      {canManage ? (
                        <span className="flex gap-1">
                          <form action={moveCheckTemplateFormAction}><input type="hidden" name="templateId" value={t.id} /><input type="hidden" name="stage" value={stage} /><input type="hidden" name="direction" value="up" /><SubmitButton label="↑" pendingLabel="…" className={btnSmall} ariaLabel={`Move up: ${t.item}`} /></form>
                          <form action={moveCheckTemplateFormAction}><input type="hidden" name="templateId" value={t.id} /><input type="hidden" name="stage" value={stage} /><input type="hidden" name="direction" value="down" /><SubmitButton label="↓" pendingLabel="…" className={btnSmall} ariaLabel={`Move down: ${t.item}`} /></form>
                          <form action={retireCheckTemplateFormAction}><input type="hidden" name="templateId" value={t.id} /><input type="hidden" name="stage" value={stage} /><SubmitButton label="Retire" pendingLabel="…" className={btnSmall} ariaLabel={`Retire: ${t.item}`} /></form>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </SectionCard>
            ))
          )}
        </div>

        {canManage ? (
          <RevealPanel label="Add a check item" open={Boolean(error)}>
            <form action={addCheckTemplateFormAction} className="space-y-4">
              <FormPendingOverlay />
              <input type="hidden" name="stage" value={stage} />
              <div><label className={label} htmlFor="item">Item</label><input id="item" name="item" required className={input} placeholder={stage === 'QA' ? 'Keyboard — every key registers' : 'RAM seated and recognised'} maxLength={160} /></div>
              <div>
                <label className={label} htmlFor="family">Family</label>
                <select id="family" name="family" className={input} defaultValue="">
                  <option value="">Every family</option>
                  {FAMILIES.map((f: ProductFamilyCode) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}
                </select>
              </div>
              <p className="text-xs text-[var(--ejo-text-muted)]">Added to the {STAGE_LABEL[stage].toLowerCase()} list.</p>
              <SubmitButton label="Add item" pendingLabel="Adding…" className={btn} />
            </form>
          </RevealPanel>
        ) : null}
      </div>
    </div>
  );
}
