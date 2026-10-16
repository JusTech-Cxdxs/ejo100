import { allows, getPrincipal, guardAnyPage, myOrganisationId } from '@/lib/authz/server';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { CAPABILITIES, type Level } from '@/lib/enyo/ml/capabilities';
import { durationStats, listModels, type ModelRow } from '@/lib/enyo/ml/overview';
import { complaintThemes } from '@/lib/enyo/ml/models';
import { retireEnyoModelFormAction, setCapabilityLevelFormAction, chooseEnyoModelFormAction } from '@/lib/actions/enyo-models';
import { PageHeader, SectionCard, StatTile, BarRow, EmptyState, Icon, CHART } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateOnly } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

export const dynamic = 'force-dynamic';

const TASK_LABEL: Record<string, string> = {
  JOB_DURATION: 'Job time estimates', ESTIMATE_LINES: 'Estimate lines', PARTS_DEMAND: 'Parts reorder suggestions', PRICE_ANOMALY: 'Unusual price warnings', COMPLAINT_THEMES: 'Complaint themes', DECISION_RISK: 'How decisions go (send-back risk)',
};
const LEVEL_TEXT: Record<Level, string> = { OFF: 'Off', SHADOW: 'Shadow — measured, not shown', ASSIST: 'Assist — shown to people', PARTIAL: 'Partial automation', FULL: 'Full automation' };
const STATUS_TONE: Record<ModelRow['status'], string> = {
  ACTIVE: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CANDIDATE: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  RETIRED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  REJECTED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]',
};
const STATUS_LABEL: Record<ModelRow['status'], string> = { ACTIVE: 'In use', CANDIDATE: 'Ready to use', RETIRED: 'Retired', REJECTED: 'Did not pass' };

const pct = (n: unknown) => (typeof n === 'number' ? `${Math.round(n * 100)}%` : '—');
const hrs = (n: unknown) => (typeof n === 'number' ? `${n.toFixed(1)} h` : '—');

/** The headline number of a model, next to its baseline's. */
function headline(m: ModelRow): string {
  const b = m.baseline ?? {};
  switch (m.task) {
    case 'JOB_DURATION': return `Error ${hrs(m.metrics.mae_hours)} (baseline ${hrs(b.mae_hours)}) · ${pct(m.metrics.range_coverage)} inside the range`;
    case 'ESTIMATE_LINES': return `F1 ${pct(m.metrics.f1)} (similar jobs ${pct(b.f1)}) · precision ${pct(m.metrics.precision)}, recall ${pct(m.metrics.recall)}`;
    case 'PRICE_ANOMALY': return `Flags ${pct(m.metrics.flagged_share_test)} of new lines (3× rule ${pct(b.flagged_share_test)})`;
    case 'PARTS_DEMAND': return `${String(m.metrics.forecast_parts ?? '—')} parts forecast · error ${String(m.metrics.backtest_mae_total ?? '—')} (naive ${String(b.backtest_mae_total ?? '—')})`;
    case 'COMPLAINT_THEMES': return `${String(m.metrics.themes ?? '—')} themes · silhouette ${typeof m.metrics.silhouette === 'number' ? m.metrics.silhouette.toFixed(2) : '—'}`;
    case 'DECISION_RISK': return `AUC ${typeof m.metrics.auc === 'number' ? m.metrics.auc.toFixed(2) : '—'} · Brier ${typeof m.metrics.brier === 'number' ? m.metrics.brier.toFixed(3) : '—'} (base rate ${typeof b.brier === 'number' ? b.brier.toFixed(3) : '—'})`;
    default: return '';
  }
}

const STATUS_MESSAGES: Record<string, string> = { model_in_use: 'The model is now in use.', model_retired: 'The model is retired.', level_saved: 'The level is saved.' };

/**
 * Enyo models: the organisation's own trained models (from the Python
 * trainer), what each is for, how it compares with a simple baseline, and the
 * automation level of each capability. Administrators choose; nothing is
 * used until they do.
 */
export default async function EnyoModelsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['enyo.manage', 'analytics.business.view'], '/enyo/models');
  const sp = await searchParams;
  const p = await getPrincipal();
  const orgId = p.organisationId ?? (await myOrganisationId());
  const [settings, canManage] = await Promise.all([getEnyoSettings(orgId), allows('enyo.manage')]);
  const [models, duration, themes] = orgId ? await Promise.all([listModels(orgId), durationStats(orgId), complaintThemes(orgId)]) : [[], null, { level: 'OFF' as Level, version: null, themes: [] }];
  const active = new Map(models.filter((m) => m.status === 'ACTIVE').map((m) => [m.task, m]));
  const maxShare = Math.max(0.01, ...themes.themes.map((t) => t.share));

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        icon="sparkles"
        eyebrow={`${settings.displayName} · Machine learning`}
        title={`${settings.displayName} models`}
        description={<>Models trained on this organisation&rsquo;s own history, checked against simple baselines on its most recent jobs. A model is used only after an administrator chooses it, and only at the level set for its capability.</>}
        back={{ href: '/enyo/learning', label: 'Learning' }}
      />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : sp.status && STATUS_MESSAGES[sp.status] ? <FormFeedbackBanner kind="success" message={STATUS_MESSAGES[sp.status]!} /> : null}
      {!settings.enabled ? <FormFeedbackBanner kind="warning" message={`${settings.displayName} is switched off for this organisation, so no model runs. Switch it on in Settings → Enyo.`} /> : null}

      <SectionCard icon="sliders" title="Capabilities and their levels" description="Off → Shadow (measured, not shown) → Assist (shown; people decide). None of these ever saves, orders or changes a price." className="mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          {CAPABILITIES.map((c) => {
            const level = settings.capabilityLevels[c.key];
            const m = active.get(c.key);
            return (
              <div key={c.key} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--ejo-text)]">{c.label}</h3>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{LEVEL_TEXT[level]}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{c.assist}</p>
                <p className="mt-2 text-xs text-[var(--ejo-text)]">{m ? <>Model in use: <span className="font-mono">{m.version}</span></> : 'No model in use yet: nothing runs until one is chosen below.'}</p>
                {canManage ? (
                  <form action={setCapabilityLevelFormAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="capability" value={c.key} />
                    <label className="text-xs text-[var(--ejo-text-muted)]" htmlFor={`level-${c.key}`}>Level</label>
                    <select id={`level-${c.key}`} name="level" defaultValue={level} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)] sm:min-h-9">
                      {c.levels.map((l) => <option key={l} value={l}>{LEVEL_TEXT[l]}</option>)}
                    </select>
                    <SubmitButton label="Save level" pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:min-h-9" />
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {duration && duration.made > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon="clock" label="Job time estimates" value={duration.made} hint={`${duration.shown} shown to people`} />
          <StatTile icon="check-circle" label="Checked" value={duration.checked} hint="Against when the vehicle was ready" />
          <StatTile icon="gauge" label="Average error" value={duration.maeHours === null ? '—' : `${duration.maeHours.toFixed(1)} h`} hint="Middle estimate against the real time" />
          <StatTile icon="percent" label="Inside the range" value={pct(duration.inRange)} hint="Real time between the low and high estimate" />
        </div>
      ) : null}

      <SectionCard icon="layers" title="Trained models" description="Newest first. Each was trained on this organisation's own history and tested on its most recent jobs, which it had not seen." className="mb-6">
        {models.length === 0 ? (
          <EmptyState icon="sparkles" title="No models yet">
            Models arrive from the trainer (the &ldquo;Train Enyo models&rdquo; workflow or <span className="font-mono">python -m ejo_ml train</span>). With enough finished jobs, each capability gets a model to review here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {models.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-[var(--ejo-text)]">{TASK_LABEL[m.task] ?? m.task}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                  </p>
                  <p className="mt-0.5 break-all font-mono text-xs text-[var(--ejo-text-muted)]">{m.version}</p>
                  <p className="mt-1 text-xs text-[var(--ejo-text)]">{headline(m)}</p>
                  <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                    {m.gate.reasons.join(' ')} Trained {formatDateOnly(m.trainedAt)} on {pluralize(m.rows, 'record')}{m.dataFrom && m.dataTo ? ` (${formatDateOnly(m.dataFrom)} – ${formatDateOnly(m.dataTo)})` : ''}.
                  </p>
                </div>
                {canManage && (m.status === 'CANDIDATE' || m.status === 'RETIRED' || m.status === 'ACTIVE') && m.task !== 'ESTIMATE_LINES' ? (
                  <form action={m.status === 'ACTIVE' ? retireEnyoModelFormAction : chooseEnyoModelFormAction} className="shrink-0">
                    <input type="hidden" name="modelId" value={m.id} />
                    <SubmitButton
                      label={m.status === 'ACTIVE' ? 'Retire' : 'Use this model'}
                      pendingLabel="Saving…"
                      className={m.status === 'ACTIVE' ? 'min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:min-h-9' : 'min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-medium text-white hover:brightness-110 sm:min-h-9'}
                    />
                  </form>
                ) : m.task === 'ESTIMATE_LINES' && m.status !== 'REJECTED' ? (
                  <p className="max-w-56 shrink-0 text-xs text-[var(--ejo-text-muted)]">Compared with the similar-jobs method on the Learning page; it replaces that method in a later release.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {themes.themes.length ? (
        <SectionCard icon="pie" title="What customers bring their vehicles in for" description={`Complaint themes found in this organisation's jobs (model ${themes.version}). Share of all complaints.`} className="mb-6">
          <div className="space-y-2">
            {themes.themes.map((t) => (
              <BarRow key={t.label} label={t.label} value={t.share} max={maxShare} colour={CHART.primary} labelWidth="14rem" note={`${pct(t.share)} · ${pluralize(t.size, 'job')}`} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard icon="info" title="How models are trained" description="No database password ever leaves the portal.">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--ejo-text)]">
          <li>The trainer reads this organisation&rsquo;s finished jobs and parts use from the portal, with names, contacts, plates and record numbers removed.</li>
          <li>It trains each capability&rsquo;s model, tests it on the newest jobs, and compares it with a simple baseline. Only a model that beats its baseline is offered as <em>Ready to use</em>.</li>
          <li>An administrator chooses it here. Shadow measures it on live work; Assist shows it to people. A model that gets worse is retired here in one click.</li>
        </ol>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--ejo-text-muted)]"><Icon name="file" size={13} />Details: docs/ML.md in the EJO 100 repository.</p>
      </SectionCard>
    </div>
  );
}
