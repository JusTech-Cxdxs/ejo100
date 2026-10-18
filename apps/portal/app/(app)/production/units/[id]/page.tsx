import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getUnit, getUnitAuditTrail } from '@/lib/actions/production';
import { searchPartsForBom } from '@/lib/actions/catalogue';
import {
  approveUnitReworkFormAction, finishUnitReworkFormAction, markUnitAssembledFormAction, packUnitFormAction, recordLineCheckFormAction, recordQaTestFormAction, recordUnitComponentFormAction,
  recordUnitSoftwareFormAction, releaseUnitToStoreFormAction, scrapUnitFormAction,
} from '@/lib/actions/production-form-handlers';
import { UNIT_STAGE_LABEL, type UnitStageCode } from '@/lib/production-core';
import { FAMILY_LABEL, type ProductFamilyCode } from '@/lib/catalogue-core';
import { humanizeAction } from '@/lib/humanize-action';
import { formatDateTime } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { StageStrip } from '@/components/production/StageStrip';
import { ChecklistItems } from '@/components/production/ChecklistForm';
import { BackLink, PageTitle, RevealPanel, SectionCard, StatusChip } from '@/components/ui';
import { btn, btnDanger, btnLine, input, label } from '@/components/production/styles';

const BANNER: Record<string, string> = {
  unit_started: 'Unit started — its serial is assigned. Record the components as they are fitted.',
  component_recorded: 'Component recorded.',
  unit_assembled: 'Assembled — the unit goes to the software station.',
  software_recorded: 'Software recorded — the unit is waiting for the line check.',
  line_check_passed: 'Line check passed — the unit is waiting for QA.',
  line_check_failed: 'Line check failed — the unit is in rework.',
  qa_passed: 'QA passed — the unit goes to packing.',
  qa_failed: 'QA failed — the unit is in rework.',
  rework_done: 'Rework recorded — back to the line check.',
  rework_approved: 'Rework approved — back to the line check.',
  unit_packed: 'Packed — the Production Manager can release it to the store.',
  unit_released: 'Released to the finished-goods store.',
  unit_scrapped: 'Unit scrapped.',
};

const ACTION_LABEL: Record<string, string> = {
  'production_unit.started': 'Unit started', 'production_unit.component_fitted': 'Component fitted', 'production_unit.assembled': 'Assembled', 'production_unit.software_installed': 'Software installed',
  'production_unit.line_check_passed': 'Line check passed', 'production_unit.line_check_failed': 'Line check failed', 'production_unit.qa_passed': 'QA passed', 'production_unit.qa_failed': 'QA failed',
  'production_unit.rework_done': 'Rework done', 'production_unit.rework_approved': 'Rework approved', 'production_unit.packed': 'Packed', 'production_unit.released': 'Released to the store', 'production_unit.scrapped': 'Scrapped',
};

/** The unit traveller: every station, who did it and when, the components inside, the checks, and the forms for the current station. */
export default async function UnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['production.view'], '/production/units/[id]');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [u, trail] = await Promise.all([getUnit(id), getUnitAuditTrail(id)]);
  if (!u) notFound();
  const stage = u.stage as UnitStageCode;
  const lineChecks = u.checks.filter((c) => c.stage === 'LINE_CHECK');
  const qaChecks = u.checks.filter((c) => c.stage === 'QA');
  const stations: { label: string; who: string | null; at: Date | null; extra?: string | null }[] = [
    { label: 'Assembled', who: u.names.assembledBy, at: u.assembledAt },
    { label: 'Software image', who: u.names.imagedBy, at: u.imagedAt },
    { label: 'Line check', who: u.names.lineCheckedBy, at: u.lineCheckedAt, extra: u.lineCheckPassed === null ? null : u.lineCheckPassed ? 'passed' : 'failed' },
    { label: 'QA test', who: u.names.qaBy, at: u.qaAt, extra: u.qaPassed === null ? null : `${u.qaPassed ? 'passed' : 'failed'}${u.burnInHours !== null ? ` · burn-in ${u.burnInHours} h` : ''}` },
    { label: 'Packed', who: u.names.packedBy, at: u.packedAt },
    { label: 'Released', who: u.names.releasedBy, at: u.releasedAt, extra: u.finishedUnit ? u.finishedUnit.location.name : null },
  ];
  return (
    <div className="w-full p-4 sm:p-8">
      <BackLink href={u.buildOrder ? `/production/build-orders/${u.buildOrder.id}` : '/production/units'} label={u.buildOrder ? `Back to ${u.buildOrder.number}` : 'Back to Units'} />
      {status && BANNER[status] ? <FormFeedbackBanner kind={status.endsWith('failed') || status === 'unit_scrapped' ? 'warning' : 'success'} message={BANNER[status]} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="bolt"><span className="font-mono">{u.serialNumber}</span></PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {u.number} · <LoadingLink href={`/catalogue/products/${u.product.id}`} className="text-[var(--ejo-primary)] hover:underline">{u.product.name}</LoadingLink>{u.configuration ? ` — ${u.configuration.name}` : ''} · {FAMILY_LABEL[u.product.family as ProductFamilyCode]}
            {u.buildOrder ? <> · <LoadingLink href={`/production/build-orders/${u.buildOrder.id}`} className="text-[var(--ejo-primary)] hover:underline">{u.buildOrder.number}</LoadingLink></> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={u.stage} label={UNIT_STAGE_LABEL[stage]} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/unit-traveller/${u.id}`} clientHref={`/print/unit-traveller/${u.id}?variant=client`} clientLabel="Box Copy" />
        </div>
      </div>

      <StageStrip stage={stage} reworkCount={u.reworkCount} />
      {stage === 'REWORK' && u.reworkNotes ? <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm"><span className="font-medium">To fix:</span> {u.reworkNotes}</div> : null}
      {u.buildOrder?.instructions ? <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/5 p-4 text-sm"><span className="font-medium">Instructions for this build:</span> {u.buildOrder.instructions}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {u.can.assemble ? (
            <SectionCard icon="wrench" title="Assembly station" description="Record each component as it is fitted (serial for motherboards and panels, lot for the rest), then mark the unit assembled.">
              <RevealPanel label="Record a component fitted" open={Boolean(error && /part|serial|component/i.test(error))}>
                <form action={recordUnitComponentFormAction} className="space-y-4">
                  <FormPendingOverlay />
                  <input type="hidden" name="unitId" value={u.id} />
                  <div><label className={label} htmlFor="partId">Part</label><SearchableSelect id="partId" name="partId" required search={searchPartsForBom} loadDefaultOptions={searchPartsForBom.bind(null, '')} defaultOptionsLabel="Parts" placeholder="Search parts…" minQueryLength={0} /></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><label className={label} htmlFor="serialNumber">Component serial (optional)</label><input id="serialNumber" name="serialNumber" className={`${input} font-mono`} maxLength={80} /></div>
                    <div><label className={label} htmlFor="lotNumber">Lot (optional)</label><input id="lotNumber" name="lotNumber" className={input} maxLength={80} /></div>
                  </div>
                  <SubmitButton label="Record component" pendingLabel="Recording…" className={btn} />
                </form>
              </RevealPanel>
              {u.can.markAssembled ? (
                <form action={markUnitAssembledFormAction} className="mt-4"><FormPendingOverlay /><input type="hidden" name="unitId" value={u.id} /><SubmitButton label="Mark assembled" pendingLabel="Saving…" className={btn} /></form>
              ) : null}
              {u.can.reworkDone ? (
                <form action={finishUnitReworkFormAction} className="mt-4 space-y-2"><FormPendingOverlay /><input type="hidden" name="unitId" value={u.id} /><label className={label} htmlFor="rnotes">What was reworked</label><input id="rnotes" name="notes" required minLength={3} className={input} maxLength={500} /><SubmitButton label="Rework done — back to the line check" pendingLabel="Saving…" className={btn} /></form>
              ) : null}
              {u.can.reworkWaitsForManager && !u.can.approveRework ? <p className="mt-4 text-sm text-[var(--ejo-warning-text)]">This unit has been reworked {u.reworkCount} times — the Production Manager must approve it going back to the line.</p> : null}
            </SectionCard>
          ) : null}

          {u.can.approveRework ? (
            <SectionCard icon="check-circle" title="Approve rework" description={`Rework ${u.reworkCount} — the Production Manager decides whether this unit goes back to the line check.`}>
              <form action={approveUnitReworkFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="unitId" value={u.id} /><input name="notes" placeholder="Note (optional)" className={input} maxLength={500} /><SubmitButton label="Approve — back to the line check" pendingLabel="Approving…" className={btn} /></form>
            </SectionCard>
          ) : null}

          {u.can.software ? (
            <SectionCard icon="layers" title="Software station" description="Confirm the image and packages installed on this unit.">
              <form action={recordUnitSoftwareFormAction} className="space-y-4">
                <FormPendingOverlay />
                <input type="hidden" name="unitId" value={u.id} />
                {u.configuration?.packages.length ? (
                  <fieldset>
                    <legend className={label}>Packages installed</legend>
                    <div className="space-y-1">
                      {u.configuration.packages.map((p) => (
                        <label key={p.packageId} className="flex items-center gap-2 text-sm"><input type="checkbox" name="packageIds" value={p.packageId} defaultChecked className="h-4 w-4" />{p.package.name}{p.package.version ? ` ${p.package.version}` : ''}{p.required ? '' : <span className="text-xs text-[var(--ejo-text-muted)]"> · optional</span>}</label>
                      ))}
                    </div>
                  </fieldset>
                ) : <p className="text-sm text-[var(--ejo-text-muted)]">No software packages are set on this configuration.</p>}
                <div><label className={label} htmlFor="imageNote">Image / version note (optional)</label><input id="imageNote" name="imageNote" className={input} maxLength={300} placeholder="e.g. Windows 11 Pro 23H2 image of 12 Sep" /></div>
                <SubmitButton label="Software installed — to the line check" pendingLabel="Saving…" className={btn} />
              </form>
            </SectionCard>
          ) : null}

          {u.can.lineCheck ? (
            <SectionCard icon="clipboard" title="Line supervisor check" description="One submit: every item PASS (or N/A) sends the unit to QA; any FAIL sends it to rework.">
              <form action={recordLineCheckFormAction} className="space-y-4">
                <FormPendingOverlay />
                <input type="hidden" name="unitId" value={u.id} />
                <ChecklistItems items={u.templates.LINE_CHECK} prefixId="lc" />
                <SubmitButton label="Submit line check" pendingLabel="Saving…" className={btn} />
              </form>
            </SectionCard>
          ) : null}

          {u.can.qa ? (
            <SectionCard icon="check-circle" title="QA test" description="Burn-in, keyboard, display, ports, battery, Wi-Fi, camera — pass or fail per item. Pass → packing; fail → rework.">
              <form action={recordQaTestFormAction} className="space-y-4">
                <FormPendingOverlay />
                <input type="hidden" name="unitId" value={u.id} />
                <ChecklistItems items={u.templates.QA} prefixId="qa" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label className={label} htmlFor="burnInHours">Burn-in hours</label><input id="burnInHours" name="burnInHours" type="number" step="0.5" min={0} max={999} className={input} /></div>
                  <div><label className={label} htmlFor="qnotes">Notes (optional)</label><input id="qnotes" name="notes" className={input} maxLength={1000} /></div>
                </div>
                <SubmitButton label="Submit QA result" pendingLabel="Saving…" className={btn} />
              </form>
            </SectionCard>
          ) : null}
          {u.can.qaIsAssembler ? <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm">You built this unit — another QA Inspector must test it.</div> : null}

          {u.can.pack || u.can.release ? (
            <SectionCard icon="package" title="Packing and release" description="Box, accessories and warranty card; then the Production Manager releases the unit to the finished-goods store.">
              <div className="flex flex-wrap gap-3">
                {u.can.pack && !u.packedAt ? <form action={packUnitFormAction}><FormPendingOverlay /><input type="hidden" name="unitId" value={u.id} /><SubmitButton label="Packed" pendingLabel="Saving…" className={btnLine} /></form> : null}
                {u.packedAt ? <p className="self-center text-sm text-[var(--ejo-text-muted)]">Packed by {u.names.packedBy} · {formatDateTime(u.packedAt)}</p> : null}
                {u.can.release ? <form action={releaseUnitToStoreFormAction}><FormPendingOverlay /><input type="hidden" name="unitId" value={u.id} /><SubmitButton label="Release to finished goods" pendingLabel="Releasing…" className={btn} /></form> : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard icon="boxes" title="Components inside this unit" description="The trace a warranty claim follows: part, serial or lot, who fitted it and when.">
            {u.components.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No components recorded yet.</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {u.components.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{c.part.name}{c.part.partNumber ? <span className="text-xs text-[var(--ejo-text-muted)]"> · {c.part.partNumber}</span> : null}{c.serialNumber ? <span className="font-mono text-xs"> · SN {c.serialNumber}</span> : null}{c.lotNumber ? <span className="text-xs"> · lot {c.lotNumber}</span> : null}</span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{c.fittedByName ?? '—'} · {formatDateTime(c.fittedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {u.configuration?.bomLines.length ? <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Bill of materials: {u.configuration.bomLines.map((l) => `${Number(l.quantity)} × ${l.part.name}`).join(', ')}</p> : null}
          </SectionCard>

          {lineChecks.length || qaChecks.length ? (
            <SectionCard icon="clipboard" title="Checks recorded">
              {[['Line check', lineChecks], ['QA test', qaChecks]].map(([title, checks]) => (checks as typeof lineChecks).length ? (
                <div key={title as string} className="mb-4 last:mb-0">
                  <h3 className="text-xs font-semibold text-[var(--ejo-text-muted)]">{title as string}</h3>
                  <ul className="mt-1 divide-y divide-[var(--ejo-border)] text-sm">
                    {(checks as typeof lineChecks).map((c) => (
                      <li key={c.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                        <span>{c.item}{c.note ? <span className="text-xs text-[var(--ejo-text-muted)]"> — {c.note}</span> : null}</span>
                        <span className="flex items-center gap-2 text-xs text-[var(--ejo-text-muted)]"><StatusChip status={c.result === 'PASS' ? 'PASSED' : c.result === 'FAIL' ? 'FAILED' : 'SKIPPED'} label={c.result === 'NA' ? 'N/A' : c.result === 'PASS' ? 'Pass' : 'Fail'} />{c.checkedByName} · {formatDateTime(c.checkedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null)}
            </SectionCard>
          ) : null}

          {u.can.scrap ? (
            <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-surface)] p-4">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-error)]">Scrap this unit</summary>
              <form action={scrapUnitFormAction} className="mt-3 space-y-2"><FormPendingOverlay /><input type="hidden" name="unitId" value={u.id} /><input name="reason" required minLength={3} placeholder="Why is it scrapped?" className={input} maxLength={500} /><SubmitButton label="Scrap unit" pendingLabel="Scrapping…" className={btnDanger} /></form>
            </details>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Stations</h2>
            <ul className="mt-2 space-y-2">
              {stations.map((s) => (
                <li key={s.label} className="flex justify-between gap-2">
                  <span className="text-[var(--ejo-text-muted)]">{s.label}</span>
                  <span className="text-right text-[var(--ejo-text)]">{s.at ? <>{s.who ?? '—'}<span className="block text-xs text-[var(--ejo-text-muted)]">{formatDateTime(s.at)}{s.extra ? ` · ${s.extra}` : ''}</span></> : <span className="text-[var(--ejo-text-muted)]">—</span>}</span>
                </li>
              ))}
            </ul>
            {u.reworkCount ? <p className="mt-3 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-warning-text)]">Reworked {u.reworkCount} {u.reworkCount === 1 ? 'time' : 'times'}{u.reworkNotes ? ` — ${u.reworkNotes}` : ''}</p> : null}
            {u.scrapReason ? <p className="mt-3 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-error)]">Scrapped: {u.scrapReason}</p> : null}
            {u.qaNotes ? <p className="mt-3 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-text-muted)]">QA notes: {u.qaNotes}</p> : null}
          </div>
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">History</h2>
            <AuditTrail
              entries={trail.map((e) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const detail = [
                  typeof meta.part === 'string' ? `${meta.part}${typeof meta.componentSerial === 'string' ? ` SN ${meta.componentSerial}` : ''}` : null,
                  Array.isArray(meta.failed) && meta.failed.length ? `Failed: ${(meta.failed as string[]).join(', ')}` : null,
                  Array.isArray(meta.packages) && meta.packages.length ? (meta.packages as string[]).join(', ') : null,
                  typeof meta.image === 'string' ? meta.image : null,
                  typeof meta.reason === 'string' ? meta.reason : null,
                  typeof meta.notes === 'string' ? meta.notes : null,
                ].filter(Boolean).join(' · ');
                return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: detail || null, dateLabel: formatDateTime(e.createdAt) };
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
