'use client';

import { useId, useMemo, useState } from 'react';
import { saveInspectionFormAction, startVehicleInspectionFormAction, skipVehicleInspectionFormAction, cancelVehicleInspectionFormAction, completeVehicleInspectionFormAction } from '@/lib/actions/vehicle-inspection-form-handlers';
import type { InspectionTemplateSection } from '@/lib/vehicle-inspection-template';
import { LoadingLink } from './LoadingLink';
import { FormPendingOverlay } from './FormPendingOverlay';
import { SubmitButton } from './SubmitButton';

type Severity = 'GOOD' | 'ATTENTION' | 'SERVICE_REQUIRED' | 'CRITICAL';

type InspectionItemRecord = {
  id: string;
  section: string;
  name: string;
  condition: string | null;
  severity: Severity | null;
  action: string | null;
  notes: string | null;
};

type InspectionRecord = {
  id: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  inspectedBy: { fullName: string };
  completedAt: Date | null;
  skippedAt: Date | null;
  skipReason: string | null;
  notes: string | null;
  items: InspectionItemRecord[];
} | null;

const SEVERITY_LABEL: Record<Severity, string> = {
  GOOD: 'Good',
  ATTENTION: 'Attention',
  SERVICE_REQUIRED: 'Service Required',
  CRITICAL: 'Critical',
};
const SEVERITY_ICON: Record<Severity, string> = {
  GOOD: '🟢',
  ATTENTION: '🟡',
  SERVICE_REQUIRED: '🟠',
  CRITICAL: '🔴',
};

export function InspectionWorkspace({
  vehicleServiceId,
  serviceNumber,
  vehicleDescription,
  vehicleType,
  template,
  inspection,
}: {
  vehicleServiceId: string;
  serviceNumber: string;
  vehicleDescription: string;
  vehicleType: 'PASSENGER' | 'COMMERCIAL';
  template: InspectionTemplateSection[];
  inspection: InspectionRecord;
}) {
  const [search, setSearch] = useState('');
  // Which reviewed items are currently expanded back into edit mode —
  // a reviewed item stays a compact summary row by default; clicking
  // Edit reveals its real fields again. Not-reviewed items are always
  // shown open, since they need to be filled in the first place.
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const itemById = useMemo(() => {
    const map = new Map<string, InspectionItemRecord>();
    inspection?.items.forEach((i) => map.set(`${i.section}::${i.name}`, i));
    return map;
  }, [inspection]);

  // Live, cross-page state — every select anywhere writes here on
  // change, so the summary bar updates immediately. Does NOT decide
  // which zone (Reviewed/Not Reviewed) an item displays in — that
  // stays tied to the real, last-saved severity, so an item never
  // jumps zones mid-edit before it's actually saved.
  const [liveSeverities, setLiveSeverities] = useState<Record<string, Severity | ''>>(() => {
    const initial: Record<string, Severity | ''> = {};
    inspection?.items.forEach((i) => {
      initial[i.id] = i.severity ?? '';
    });
    return initial;
  });

  const summary = useMemo(() => {
    const counts: Record<Severity | 'NOT_REVIEWED', number> = { GOOD: 0, ATTENTION: 0, SERVICE_REQUIRED: 0, CRITICAL: 0, NOT_REVIEWED: 0 };
    Object.values(liveSeverities).forEach((s) => {
      if (s) counts[s]++;
      else counts.NOT_REVIEWED++;
    });
    return counts;
  }, [liveSeverities]);

  const isCompleted = inspection?.status === 'COMPLETED';
  const isSkipped = inspection?.status === 'SKIPPED';
  const searchLower = search.trim().toLowerCase();

  // Every section's rows, real-filtered by search, split into its own
  // reviewed/not-reviewed rows. Built once here so both zones below
  // read from the exact same real per-section breakdown — never two
  // slightly different derivations that could quietly disagree.
  const sectionsWithRows = useMemo(() => {
    return template
      .map((section) => {
        const sectionMatches = Boolean(searchLower) && section.section.toLowerCase().includes(searchLower);
        const rows = section.items
          .map((templateItem) => ({ templateItem, record: itemById.get(`${section.section}::${templateItem.name}`) }))
          .filter(({ templateItem }) => !searchLower || sectionMatches || templateItem.name.toLowerCase().includes(searchLower));
        return {
          section: section.section,
          reviewed: rows.filter(({ record }) => record?.severity),
          notReviewed: rows.filter(({ record }) => !record?.severity),
        };
      })
      .filter((s) => s.reviewed.length > 0 || s.notReviewed.length > 0);
  }, [template, itemById, searchLower]);

  const allItemIds = useMemo(
    () => sectionsWithRows.flatMap((s) => [...s.reviewed, ...s.notReviewed].map(({ record }) => record?.id).filter((id): id is string => Boolean(id))),
    [sectionsWithRows],
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--ejo-text)] sm:text-2xl">Vehicle Inspection</h1>
        <LoadingLink href={`/workshop/vehicle-service/${vehicleServiceId}`} className="mt-1 block text-sm text-[var(--ejo-primary)] hover:underline">
          {serviceNumber} — {vehicleDescription}
        </LoadingLink>
        <div className="mt-3 inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-info)]/10 px-3 py-2 text-sm text-[var(--ejo-text)]">
          <span className="font-medium">{vehicleType === 'COMMERCIAL' ? 'Commercial Vehicle' : 'Passenger Vehicle'}</span>
          <span className="text-[var(--ejo-text-muted)]">
            — {vehicleType === 'COMMERCIAL' ? 'commercial-specific items (air brakes, chassis, kingpins…) are included below.' : 'showing the standard passenger checklist.'}
          </span>
        </div>
      </div>

      {isSkipped ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm text-[var(--ejo-text)]">
          <p>
            Inspection skipped by {inspection.inspectedBy.fullName}
            {inspection.skippedAt ? ` on ${new Date(inspection.skippedAt).toLocaleString('en-NG')}` : ''}.
          </p>
          {inspection.skipReason ? <p className="mt-2 text-[var(--ejo-text-muted)]">Reason: {inspection.skipReason}</p> : null}
          <LoadingLink
            href={`/workshop/vehicle-service/${vehicleServiceId}`}
            className="mt-3 inline-block text-xs font-medium text-[var(--ejo-primary)] hover:underline"
          >
            Need to raise an estimate anyway? Go to {serviceNumber} →
          </LoadingLink>
          <form action={cancelVehicleInspectionFormAction} className="mt-4">
            <FormPendingOverlay />
            <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
            <input type="hidden" name="redirectTo" value={`/workshop/vehicle-service/${vehicleServiceId}/inspection`} />
            <SubmitButton label="Reopen — Inspect or Skip Again" pendingLabel="Reopening…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
          </form>
        </div>
      ) : !inspection ? (
        <div className="grid max-w-lg gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Start the inspection</h2>
            <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">Generates the checklist for this vehicle&apos;s own type.</p>
            <form action={startVehicleInspectionFormAction} className="mt-4">
              <FormPendingOverlay />
              <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
              <SubmitButton label="Start Inspection" pendingLabel="Starting…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90" />
            </form>
          </div>
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Skip this inspection</h2>
            <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">Recorded who skipped it and when — this is never silent.</p>
            <form action={skipVehicleInspectionFormAction} className="mt-4 space-y-2">
              <FormPendingOverlay />
              <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
              <input name="reason" placeholder="Reason (optional)" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]" />
              <SubmitButton label="Skip Inspection" pendingLabel="Skipping…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
            </form>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(['GOOD', 'ATTENTION', 'SERVICE_REQUIRED', 'CRITICAL'] as const).map((s) => (
              <span key={s} className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1.5 text-sm text-[var(--ejo-text)]">
                {SEVERITY_ICON[s]} {SEVERITY_LABEL[s]} — {summary[s]}
              </span>
            ))}
            {summary.NOT_REVIEWED > 0 ? (
              <span className="rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1.5 text-sm text-[var(--ejo-text-muted)]">
                ⚪ Not Reviewed — {summary.NOT_REVIEWED}
              </span>
            ) : null}
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a category or an item — e.g. Brakes, Engine Oil, Battery…"
            className="mb-6 w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
          />

          <form action={saveInspectionFormAction}>
            <FormPendingOverlay />
            <input type="hidden" name="inspectionId" value={inspection.id} />
            <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
            <input type="hidden" name="itemIds" value={allItemIds.join(',')} />

            {/* REVIEWED ZONE — every category that has at least one
                reviewed item, all together, never mixed with anything
                not yet reviewed. Its own distinct background. */}
            {sectionsWithRows.some((s) => s.reviewed.length > 0) ? (
              <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-4 sm:p-5">
                <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">✅ Reviewed</h2>
                <div className="space-y-4">
                  {sectionsWithRows.map(({ section, reviewed }) =>
                    reviewed.length === 0 ? null : (
                      <div key={`${section}-reviewed`}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{section}</p>
                        <div className="space-y-2">
                          {reviewed.map(({ templateItem, record }) => {
                            if (!record) return null;
                            const isEditing = editingIds.has(record.id);
                            return isEditing ? (
                              <div key={record.id}>
                                <FieldSet
                                  itemId={record.id}
                                  templateItem={templateItem}
                                  record={record}
                                  currentSeverity={liveSeverities[record.id] ?? ''}
                                  onSeverityChange={(sev) => setLiveSeverities((prev) => ({ ...prev, [record.id]: sev }))}
                                />
                                <button
                                  type="button"
                                  onClick={() => setEditingIds((prev) => { const next = new Set(prev); next.delete(record.id); return next; })}
                                  className="mt-1 text-xs text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
                                >
                                  Done editing
                                </button>
                              </div>
                            ) : (
                              <div key={record.id} className="flex items-start justify-between gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-surface)] px-3 py-2.5">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-[var(--ejo-text)]">{record.name}</span>
                                    <span className="text-xs">
                                      {SEVERITY_ICON[record.severity as Severity]} {SEVERITY_LABEL[record.severity as Severity]}
                                    </span>
                                  </div>
                                  {record.condition || record.action || record.notes ? (
                                    <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">
                                      {[record.condition, record.action, record.notes].filter(Boolean).join(' — ')}
                                    </p>
                                  ) : null}
                                  {/* Preserves this item's real saved values in the whole
                                      inspection's submit even while it's collapsed to a summary
                                      row — never left out of the form just because it isn't
                                      visually being edited right now. */}
                                  <input type="hidden" name={`condition-${record.id}`} value={record.condition ?? ''} />
                                  <input type="hidden" name={`severity-${record.id}`} value={record.severity ?? ''} />
                                  <input type="hidden" name={`action-${record.id}`} value={record.action ?? ''} />
                                  <input type="hidden" name={`notes-${record.id}`} value={record.notes ?? ''} />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setEditingIds((prev) => new Set(prev).add(record.id))}
                                  className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2.5 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                                >
                                  Edit
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {/* NOT REVIEWED ZONE — every category that still has at
                least one unreviewed item, all together, kept fully
                apart from the Reviewed zone above. Its own distinct
                background so the two are never mistaken for one
                continuous list. */}
            {sectionsWithRows.some((s) => s.notReviewed.length > 0) ? (
              <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-4 sm:p-5">
                <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">⚪ Not Reviewed</h2>
                <div className="space-y-4">
                  {sectionsWithRows.map(({ section, notReviewed }) =>
                    notReviewed.length === 0 ? null : (
                      <div key={`${section}-notreviewed`}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{section}</p>
                        <div className="space-y-2">
                          {notReviewed.map(({ templateItem, record }) =>
                            record ? (
                              <FieldSet
                                key={record.id}
                                itemId={record.id}
                                templateItem={templateItem}
                                record={record}
                                currentSeverity={liveSeverities[record.id] ?? ''}
                                onSeverityChange={(sev) => setLiveSeverities((prev) => ({ ...prev, [record.id]: sev }))}
                              />
                            ) : null,
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            <SubmitButton
              label="Save Changes"
              pendingLabel="Saving…"
              className="mt-6 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            />
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <form action={completeVehicleInspectionFormAction} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <FormPendingOverlay />
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{isCompleted ? 'Update completion' : 'Complete this inspection'}</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {isCompleted
                  ? 'Already marked complete — items above stay fully editable, and saving here just updates the notes below.'
                  : "Marks this inspection done for now. Items you haven't reviewed just stay Not Reviewed — that's fine, this doesn't lock anything."}
              </p>
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
              <textarea
                name="notes"
                rows={2}
                defaultValue={inspection.notes ?? ''}
                placeholder="Optional overall notes"
                className="mt-3 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
              />
              <SubmitButton
                label={isCompleted ? 'Update Completion' : 'Complete Inspection'}
                pendingLabel="Saving…"
                className="mt-3 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              />
              {isCompleted && inspection.completedAt ? (
                <>
                  <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
                    Completed by {inspection.inspectedBy.fullName} on {new Date(inspection.completedAt).toLocaleString('en-NG')}.
                  </p>
                  <LoadingLink
                    href={`/workshop/vehicle-service/${vehicleServiceId}`}
                    className="mt-2 inline-block text-xs font-medium text-[var(--ejo-primary)] hover:underline"
                  >
                    Found something that needs an estimate? Go create it →
                  </LoadingLink>
                </>
              ) : null}
            </form>

            <form action={cancelVehicleInspectionFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
              <input type="hidden" name="redirectTo" value={`/workshop/vehicle-service/${vehicleServiceId}/inspection`} />
              <SubmitButton
                label="Cancel This Inspection"
                pendingLabel="Cancelling…"
                className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)] px-4 py-2.5 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10"
              />
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/** One item's real inputs, condition/action datalist-driven, severity
 * select feeding the live summary via onSeverityChange. */
function FieldSet({
  itemId,
  templateItem,
  record,
  currentSeverity,
  onSeverityChange,
}: {
  itemId: string;
  templateItem: InspectionTemplateSection['items'][number];
  record: InspectionItemRecord;
  currentSeverity: Severity | '';
  onSeverityChange: (severity: Severity | '') => void;
}) {
  const conditionListId = useId();
  const actionListId = useId();
  return (
    <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3">
      <p className="mb-2 text-sm font-medium text-[var(--ejo-text)]">{templateItem.name}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <input
            name={`condition-${itemId}`}
            list={conditionListId}
            defaultValue={record.condition ?? ''}
            placeholder="Condition"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
          />
          <datalist id={conditionListId}>
            {templateItem.conditionOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <select
          name={`severity-${itemId}`}
          value={currentSeverity}
          onChange={(e) => onSeverityChange(e.target.value as Severity | '')}
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
        >
          <option value="">Not reviewed</option>
          <option value="GOOD">🟢 Good</option>
          <option value="ATTENTION">🟡 Attention</option>
          <option value="SERVICE_REQUIRED">🟠 Service Required</option>
          <option value="CRITICAL">🔴 Critical</option>
        </select>
        <div>
          <input
            name={`action-${itemId}`}
            list={actionListId}
            defaultValue={record.action ?? ''}
            placeholder="Action"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
          />
          <datalist id={actionListId}>
            {templateItem.actionOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <input
          name={`notes-${itemId}`}
          defaultValue={record.notes ?? ''}
          placeholder="Notes"
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
        />
      </div>
    </div>
  );
}
