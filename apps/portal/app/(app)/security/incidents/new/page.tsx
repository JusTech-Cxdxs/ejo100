import { reportIncidentFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { INCIDENT_TYPES, SEVERITY_LABEL } from '@/lib/security-rules';

export default async function ReportIncidentPage({ searchParams }: { searchParams: Promise<{ error?: string; related?: string }> }) {
  const { error, related } = await searchParams;
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/incidents" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Incidents</LoadingLink>
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">Report an incident</h1>
      <SecurityNav active="/security/incidents" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <form action={reportIncidentFormAction} className="max-w-2xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <FormPendingOverlay />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>What happened (type)</label>
            <select name="type" required defaultValue="" className={input}>
              <option value="" disabled>Tap to choose…</option>
              {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>How serious</label>
            <select name="severity" required defaultValue="" className={input}>
              <option value="" disabled>Tap to choose…</option>
              {Object.entries(SEVERITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}{k === 'HIGH' || k === 'CRITICAL' ? ' — Managers are told too' : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label}>When it happened</label><input name="occurredAt" type="datetime-local" required className={input} /></div>
          <div><label className={label}>Where</label><input name="location" required placeholder="e.g. Main gate, workshop bay 3, car park" className={input} /></div>
        </div>
        <div><label className={label}>Describe what happened</label><textarea name="description" required rows={4} placeholder="Say exactly what happened, in order." className={input} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label}>People involved (optional)</label><input name="peopleInvolved" placeholder="Names, staff or visitors" className={input} /></div>
          <div><label className={label}>Vehicle plate (optional)</label><input name="vehiclePlate" placeholder="e.g. KJA 453 GX" className={`${input} uppercase`} /></div>
        </div>
        <div><label className={label}>Action already taken (optional)</label><input name="actionTaken" placeholder="e.g. Visitor escorted out, CSO called" className={input} /></div>
        <div><label className={label}>Related record number (optional)</label><input name="relatedNumber" defaultValue={related ?? ''} placeholder="A VIS, VP, EP, RT, VX, DLV or CTR number" className={`${input} uppercase`} /></div>
        <SubmitButton label="Report incident" pendingLabel="Reporting…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
      </form>
    </div>
  );
}
