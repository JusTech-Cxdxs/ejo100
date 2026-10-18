import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getBuildOrder, getBuildOrderAuditTrail } from '@/lib/actions/production';
import { searchPartsForBom } from '@/lib/actions/catalogue';
import {
  cancelBuildOrderFormAction, checkBuildOrderMaterialsFormAction, closeBuildOrderFormAction, completeBuildOrderFormAction, holdBuildOrderFormAction, issueMaterialsFormAction,
  releaseBuildOrderFormAction, resumeBuildOrderFormAction, startUnitFormAction,
} from '@/lib/actions/production-form-handlers';
import { BUILD_STATUS_LABEL, UNIT_STAGE_LABEL, type BuildOrderStatusCode, type UnitStageCode } from '@/lib/production-core';
import { STATION_LABEL, type Station } from '@/lib/catalogue-core';
import { humanizeAction } from '@/lib/humanize-action';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BackLink, PageTitle, ResponsiveTable, RevealPanel, SectionCard, StatusChip } from '@/components/ui';
import { btn, btnDanger, btnLine, input, label, tableHead, tableRow, td, th } from '@/components/production/styles';

const BANNER: Record<string, string> = {
  build_order_created: 'Build order created — check the materials next.',
  materials_checked: 'Materials checked — everything is available. The Production Manager can release it to the line.',
  materials_short: 'Materials checked — there are shortages (noted below). Raise a requisition, or release anyway and issue what is there.',
  build_order_released: 'Released to the line.',
  materials_issued: 'Materials issued to the line.',
  build_order_held: 'Build order put on hold.',
  build_order_resumed: 'Build order resumed.',
  build_order_completed: 'Build order completed.',
  build_order_closed: 'Build order closed.',
  build_order_cancelled: 'Build order cancelled.',
};

const ACTION_LABEL: Record<string, string> = {
  'build_order.created': 'Build order created', 'build_order.materials_checked': 'Materials checked', 'build_order.released': 'Released to the line', 'build_order.materials_issued': 'Materials issued',
  'build_order.unit_started': 'Unit started', 'build_order.held': 'Put on hold', 'build_order.resumed': 'Resumed', 'build_order.completed': 'Completed', 'build_order.closed': 'Closed', 'build_order.cancelled': 'Cancelled',
};

export default async function BuildOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['production.view'], '/production/build-orders/[id]');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [b, trail] = await Promise.all([getBuildOrder(id), getBuildOrderAuditTrail(id)]);
  if (!b) notFound();
  const st = b.status as BuildOrderStatusCode;
  const cfg = b.configuration;
  const steps = [
    { label: 'Planned', done: true, who: b.plannedBy.fullName, at: b.createdAt },
    { label: 'Materials checked', done: st !== 'PLANNED' && st !== 'CANCELLED', who: null, at: null },
    { label: 'Released', done: Boolean(b.releasedAt), who: b.names.releasedBy, at: b.releasedAt },
    { label: 'Built', done: Boolean(b.completedAt), who: null, at: b.completedAt },
    { label: 'Closed', done: Boolean(b.closedAt), who: b.names.closedBy, at: b.closedAt },
  ];
  return (
    <div className="w-full p-4 sm:p-8">
      <BackLink href="/production/build-orders" label="Back to Build orders" />
      {status && BANNER[status] ? <FormFeedbackBanner kind={status === 'materials_short' ? 'warning' : 'success'} message={BANNER[status]} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="clipboard">{b.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {b.quantity} × <LoadingLink href={`/catalogue/products/${cfg.product.id}/configurations/${cfg.id}`} className="text-[var(--ejo-primary)] hover:underline">{cfg.product.name} — {cfg.name}</LoadingLink>
            <span className="font-mono"> ({cfg.product.sku}-{cfg.code})</span> · {b.purpose === 'TO_STOCK' ? 'to stock' : 'for an order'}{b.salesOrder ? ` · ${b.salesOrder.number}` : ''}{b.project ? ` · ${b.project.number}` : ''} · {b.branch.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={b.status} label={BUILD_STATUS_LABEL[st]} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/build-order/${b.id}`} clientHref={`/print/build-order/${b.id}?variant=client`} clientLabel="Line Copy" />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${s.done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <p className="font-medium text-[var(--ejo-text)]">{s.done ? '✓' : `${i + 1}.`} {s.label}</p>
            {s.done && s.who ? <p className="text-[var(--ejo-text-muted)]">{s.who}</p> : null}
            {s.done && s.at ? <p className="text-[var(--ejo-text-muted)]">{formatDateOnly(s.at)}</p> : null}
          </div>
        ))}
      </div>

      {st === 'ON_HOLD' && b.holdReason ? <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm"><span className="font-medium">On hold:</span> {b.holdReason}</div> : null}
      {st === 'CANCELLED' && b.holdReason ? <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-4 text-sm"><span className="font-medium">Cancelled:</span> {b.holdReason}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SectionCard icon="boxes" title="Materials" description={`Bill of materials × ${b.quantity}, against free stock in the components warehouse, net of what was already issued.`} flush>
            {b.availability.lines.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[var(--ejo-text-muted)]">This configuration has no bill of materials yet — nothing to check or issue.</p>
            ) : (
              <ResponsiveTable flush>
                <table className="w-full text-sm">
                  <thead><tr className={tableHead}><th className={th}>Part</th><th className={`${th} text-right`}>Required</th><th className={`${th} text-right`}>Issued</th><th className={`${th} text-right`}>Available</th><th className={`${th} text-right`}>Short</th></tr></thead>
                  <tbody>
                    {b.availability.lines.map((l) => (
                      <tr key={l.partId} className={tableRow}>
                        <td className={td}>{l.name}{l.isOptional ? <span className="text-xs text-[var(--ejo-text-muted)]"> · optional</span> : null}</td>
                        <td data-label="Required" className={`${td} text-right tabular-nums`}>{l.required}</td>
                        <td data-label="Issued" className={`${td} text-right tabular-nums`}>{l.issued}</td>
                        <td data-label="Available" className={`${td} text-right tabular-nums`}>{Math.max(0, l.available)}</td>
                        <td data-label="Short" className={`${td} text-right tabular-nums ${l.shortage > 0 && !l.isOptional ? 'font-semibold text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>{l.shortage > 0 ? l.shortage : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
            {b.shortageNote ? <p className="border-t border-[var(--ejo-border)] px-5 py-3 text-xs text-[var(--ejo-warning-text)]">Shortages at the last check: {b.shortageNote}</p> : null}
            {b.can.plan && (st === 'PLANNED' || st === 'MATERIALS_CHECKED') ? (
              <form action={checkBuildOrderMaterialsFormAction} className="border-t border-[var(--ejo-border)] px-5 py-4">
                <FormPendingOverlay />
                <input type="hidden" name="buildOrderId" value={b.id} />
                <SubmitButton label={st === 'PLANNED' ? 'Check materials' : 'Check materials again'} pendingLabel="Checking…" className={btn} />
              </form>
            ) : null}
          </SectionCard>

          {b.can.issueMaterials ? (
            <SectionCard icon="truck" title="Issue materials to the line" description="Recorded against this build order; the running stock total goes down.">
              {b.materialIssues.length ? (
                <ul className="mb-4 divide-y divide-[var(--ejo-border)] text-sm">
                  {b.materialIssues.map((m) => (
                    <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{m.quantity} {m.part.baseUnitOfMeasure} · {m.part.name}{m.lotOrSerials ? <span className="text-xs text-[var(--ejo-text-muted)]"> · {m.lotOrSerials}</span> : null}</span><span className="text-xs text-[var(--ejo-text-muted)]">{m.issuedByName} · {formatDateTime(m.issuedAt)}</span></li>
                  ))}
                </ul>
              ) : null}
              <RevealPanel label="Issue a part" open={Boolean(error && /issue|free|warehouse/i.test(error))}>
                <form action={issueMaterialsFormAction} className="space-y-4">
                  <FormPendingOverlay />
                  <input type="hidden" name="buildOrderId" value={b.id} />
                  <div><label className={label} htmlFor="partId">Part</label><SearchableSelect id="partId" name="partId" required search={searchPartsForBom} loadDefaultOptions={searchPartsForBom.bind(null, '')} defaultOptionsLabel="Parts" placeholder="Search parts…" minQueryLength={0} /></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><label className={label} htmlFor="quantity">Quantity</label><input id="quantity" name="quantity" type="number" step="0.001" min="0.001" required className={input} /></div>
                    <div><label className={label} htmlFor="lotOrSerials">Lot or serials (optional)</label><input id="lotOrSerials" name="lotOrSerials" className={input} maxLength={500} placeholder="Lot 2026-09 or serial numbers" /></div>
                    <div className="sm:col-span-2"><label className={label} htmlFor="inotes">Note (optional)</label><input id="inotes" name="notes" className={input} maxLength={500} /></div>
                  </div>
                  <SubmitButton label="Issue to the line" pendingLabel="Issuing…" className={btn} />
                </form>
              </RevealPanel>
            </SectionCard>
          ) : b.materialIssues.length ? (
            <SectionCard icon="truck" title="Materials issued">
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {b.materialIssues.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{m.quantity} {m.part.baseUnitOfMeasure} · {m.part.name}</span><span className="text-xs text-[var(--ejo-text-muted)]">{m.issuedByName} · {formatDateTime(m.issuedAt)}</span></li>)}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard icon="bolt" title={`Units (${b.counts.started} of ${b.quantity} started)`} description={`${b.counts.onLine} on the line · ${b.counts.released} released to the store${b.counts.scrapped ? ` · ${b.counts.scrapped} scrapped` : ''}`} flush
            actions={b.can.startUnit ? (
              <form action={startUnitFormAction}><FormPendingOverlay /><input type="hidden" name="buildOrderId" value={b.id} /><SubmitButton label="Start unit" pendingLabel="Starting…" className={btn} /></form>
            ) : undefined}>
            {b.units.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[var(--ejo-text-muted)]">{(['RELEASED', 'IN_PROGRESS', 'QA'] as string[]).includes(st) ? 'No units started yet — an assembler starts the first one.' : 'Units are started once the build order is released to the line.'}</p>
            ) : (
              <ResponsiveTable flush>
                <table className="w-full text-sm">
                  <thead><tr className={tableHead}><th className={th}>Serial</th><th className={th}>Stage</th><th className={th}>Assembler</th><th className={th}>Last change</th></tr></thead>
                  <tbody>
                    {b.units.map((u) => (
                      <tr key={u.id} className={tableRow}>
                        <td className={td}><LoadingLink href={`/production/units/${u.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{u.serialNumber}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{u.number}</div></td>
                        <td data-label="Stage" className={td}><StatusChip status={u.stage} label={UNIT_STAGE_LABEL[u.stage as UnitStageCode]} />{u.reworkCount ? <span className="ml-2 text-xs text-[var(--ejo-warning-text)]">rework ×{u.reworkCount}</span> : null}</td>
                        <td data-label="Assembler" className={td}>{u.assembledByName ?? '—'}</td>
                        <td data-label="Last change" className={`${td} text-xs text-[var(--ejo-text-muted)]`}>{formatDateTime(u.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </SectionCard>

          {cfg.packages.length || cfg.bomLines.length ? (
            <SectionCard icon="sliders" title="Configuration">
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-[var(--ejo-text-muted)]">Bill of materials per unit</p>
                  <ul className="mt-1 space-y-0.5">{cfg.bomLines.map((l) => <li key={l.id}>{Number(l.quantity)} × {l.part.name} <span className="text-xs text-[var(--ejo-text-muted)]">· {STATION_LABEL[l.station as Station] ?? l.station}</span></li>)}</ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--ejo-text-muted)]">Software packages</p>
                  <ul className="mt-1 space-y-0.5">{cfg.packages.map((x) => <li key={x.packageId}>{x.package.name}{x.package.version ? ` ${x.package.version}` : ''}{x.required ? '' : <span className="text-xs text-[var(--ejo-text-muted)]"> · optional</span>}</li>)}</ul>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <dl className="mt-2 space-y-1 text-[var(--ejo-text-muted)]">
              <div className="flex justify-between gap-2"><dt>Due</dt><dd className="text-[var(--ejo-text)]">{b.dueDate ? formatDateOnly(b.dueDate) : 'Not set'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Priority</dt><dd className="text-[var(--ejo-text)]">{b.priority}</dd></div>
              <div className="flex justify-between gap-2"><dt>Planned by</dt><dd className="text-[var(--ejo-text)]">{b.plannedBy.fullName}</dd></div>
            </dl>
            {b.instructions ? <div className="mt-3 border-t border-[var(--ejo-border)] pt-3"><p className="text-xs font-medium text-[var(--ejo-text-muted)]">Instructions for the line</p><p className="mt-1 whitespace-pre-line text-[var(--ejo-text)]">{b.instructions}</p></div> : null}
          </div>

          {b.can.release || b.can.selfRelease || (b.can.manage && (st === 'RELEASED' || st === 'IN_PROGRESS' || st === 'QA' || st === 'ON_HOLD' || st === 'COMPLETED')) || (b.can.plan && (st === 'PLANNED' || st === 'MATERIALS_CHECKED')) ? (
            <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
              {b.can.release ? (
                <form action={releaseBuildOrderFormAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="buildOrderId" value={b.id} />
                  <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{b.shortageNote ? 'Shortages were noted — the line will build what the materials allow.' : 'Materials are available.'}</p>
                  <SubmitButton label="Release to the line" pendingLabel="Releasing…" className={`${btn} w-full`} />
                </form>
              ) : null}
              {b.can.selfRelease ? <p className="text-xs text-[var(--ejo-warning-text)]">You planned this build order — another Production Manager must release it to the line.</p> : null}
              {b.can.manage && st === 'ON_HOLD' ? (
                <form action={resumeBuildOrderFormAction}><FormPendingOverlay /><input type="hidden" name="buildOrderId" value={b.id} /><SubmitButton label="Resume" pendingLabel="Resuming…" className={`${btn} w-full`} /></form>
              ) : null}
              {b.can.manage && (st === 'IN_PROGRESS' || st === 'QA') ? (
                <form action={completeBuildOrderFormAction}><FormPendingOverlay /><input type="hidden" name="buildOrderId" value={b.id} /><SubmitButton label="Mark completed" pendingLabel="Completing…" className={`${btnLine} w-full`} /></form>
              ) : null}
              {b.can.manage && st === 'COMPLETED' ? (
                <form action={closeBuildOrderFormAction}><FormPendingOverlay /><input type="hidden" name="buildOrderId" value={b.id} /><SubmitButton label="Close build order" pendingLabel="Closing…" className={`${btn} w-full`} /></form>
              ) : null}
              {b.can.manage && (st === 'RELEASED' || st === 'IN_PROGRESS' || st === 'QA') ? (
                <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                  <summary className="cursor-pointer text-sm font-medium">Put on hold</summary>
                  <form action={holdBuildOrderFormAction} className="mt-3 space-y-2"><FormPendingOverlay /><input type="hidden" name="buildOrderId" value={b.id} /><input name="reason" required minLength={3} placeholder="Why?" className={input} maxLength={500} /><SubmitButton label="Put on hold" pendingLabel="Saving…" className={`${btnLine} w-full`} /></form>
                </details>
              ) : null}
              {b.can.plan && (st === 'PLANNED' || st === 'MATERIALS_CHECKED' || st === 'RELEASED' || st === 'ON_HOLD') && b.units.length === 0 ? (
                <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-error)]">Cancel build order</summary>
                  <form action={cancelBuildOrderFormAction} className="mt-3 space-y-2"><FormPendingOverlay /><input type="hidden" name="buildOrderId" value={b.id} /><input name="reason" required minLength={3} placeholder="Why?" className={input} maxLength={500} /><SubmitButton label="Cancel build order" pendingLabel="Cancelling…" className={`${btnDanger} w-full`} /></form>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">History</h2>
            <AuditTrail
              entries={trail.map((e) => {
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                const detail = [
                  typeof meta.reason === 'string' ? meta.reason : null,
                  typeof meta.shortageNote === 'string' ? `Short: ${meta.shortageNote}` : meta.ok === true ? 'All materials available' : null,
                  typeof meta.part === 'string' ? `${String(meta.quantity ?? '')} ${String(meta.unit ?? '')} ${meta.part}`.trim() : null,
                  typeof meta.serialNumber === 'string' ? meta.serialNumber : null,
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
