'use client';

import { useId, useMemo, useState } from 'react';
import { saveInspectionSectionFormAction, startVehicleInspectionFormAction, skipVehicleInspectionFormAction, completeVehicleInspectionFormAction } from '@/lib/actions/vehicle-inspection-form-handlers';
import type { InspectionTemplateSection } from '@/lib/vehicle-inspection-template';
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
  const itemById = useMemo(() => {
    const map = new Map<string, InspectionItemRecord>();
    inspection?.items.forEach((i) => map.set(`${i.section}::${i.name}`, i));
    return map;
  }, [inspection]);

  // Live, cross-section state — every select on the whole page writes
  // here on change, so the summary bar updates immediately regardless
  // of which section it's in or whether anything's been saved yet.
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
  const readOnly = isCompleted;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--ejo-text)] sm:text-2xl">Vehicle Inspection</h1>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          {serviceNumber} — {vehicleDescription}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-info)]/10 px-3 py-2 text-sm text-[var(--ejo-text)]">
          <span className="font-medium">{vehicleType === 'COMMERCIAL' ? 'Commercial Vehicle' : 'Passenger Vehicle'}</span>
          <span className="text-[var(--ejo-text-muted)]">
            — {vehicleType === 'COMMERCIAL' ? 'commercial-specific items (air brakes, chassis, kingpins…) are included below.' : 'showing the standard passenger checklist.'}
          </span>
        </div>
      </div>

      {isSkipped ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm text-[var(--ejo-text)]">
          Inspection skipped by {inspection.inspectedBy.fullName}
          {inspection.skippedAt ? ` on ${new Date(inspection.skippedAt).toLocaleString('en-NG')}` : ''}.
          {inspection.skipReason ? <p className="mt-2 text-[var(--ejo-text-muted)]">Reason: {inspection.skipReason}</p> : null}
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
          <div className="mb-6 flex flex-wrap gap-2">
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

          <div className="space-y-4">
            {template.map((section) => {
              const rows = section.items.map((templateItem) => {
                const record = itemById.get(`${section.section}::${templateItem.name}`);
                return { templateItem, record };
              });
              return (
                <div key={section.section} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{section.section}</h2>
                  {readOnly ? (
                    <ul className="mt-3 space-y-2">
                      {rows.map(({ templateItem, record }) => (
                        <li key={templateItem.name} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[var(--ejo-text)]">{templateItem.name}</span>
                            {record?.severity ? (
                              <span className="text-xs">
                                {SEVERITY_ICON[record.severity]} {SEVERITY_LABEL[record.severity]}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--ejo-text-muted)]">Not reviewed</span>
                            )}
                          </div>
                          {record?.condition || record?.action || record?.notes ? (
                            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                              {[record?.condition, record?.action, record?.notes].filter(Boolean).join(' — ')}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <form action={saveInspectionSectionFormAction} className="mt-3 space-y-3">
                      <FormPendingOverlay />
                      <input type="hidden" name="inspectionId" value={inspection.id} />
                      <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
                      <input type="hidden" name="itemIds" value={rows.map(({ record }) => record?.id).filter(Boolean).join(',')} />
                      {rows.map(({ templateItem, record }) =>
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
                      <SubmitButton
                        label={`Save ${section.section}`}
                        pendingLabel="Saving…"
                        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                      />
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          {isCompleted ? (
            <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5 text-sm text-[var(--ejo-text)]">
              Completed by {inspection.inspectedBy.fullName}
              {inspection.completedAt ? ` on ${new Date(inspection.completedAt).toLocaleString('en-NG')}` : ''}.
              {inspection.notes ? <p className="mt-2 text-[var(--ejo-text-muted)]">{inspection.notes}</p> : null}
            </div>
          ) : (
            <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Complete this inspection</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Locks the checklist. Save every section that matters to this visit first — items left
                unreviewed just stay unreviewed, they don&apos;t block completion.
              </p>
              <form action={completeVehicleInspectionFormAction} className="mt-3 space-y-2">
                <FormPendingOverlay />
                <input type="hidden" name="inspectionId" value={inspection.id} />
                <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Optional overall notes"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton label="Complete Inspection" pendingLabel="Completing…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90" />
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One item's real inputs, condition/action datalist-driven, severity
 * select feeding the live summary via onSeverityChange — separated
 * from ItemRow above since this variant needs the real saved record
 * for defaultValue, which the plain template preview never has. */
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
    <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
      <p className="mb-2 text-sm font-medium text-[var(--ejo-text)]">{templateItem.name}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <input
            name={`condition-${itemId}`}
            list={conditionListId}
            defaultValue={record.condition ?? ''}
            placeholder="Condition"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
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
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
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
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
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
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
        />
      </div>
    </div>
  );
}
