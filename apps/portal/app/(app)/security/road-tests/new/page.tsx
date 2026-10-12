import { notFound } from 'next/navigation';
import { seeJobCard, seeService, guardAnyPage } from '@/lib/authz/server';
import { prisma } from '@ejo/database';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { requireUser } from '@/lib/actions/workshop';
import { requestRoadTestFormAction } from '@/lib/actions/security-form-handlers';
import { SecurityNav } from '@/components/SecurityNav';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { durationText } from '@/lib/security-rules';
import { PageHeader } from '@/components/ui';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export default async function NewRoadTestPage({ searchParams }: { searchParams: Promise<{ jobCardId?: string; vehicleServiceId?: string; error?: string }> }) {
  await guardAnyPage(['security.view', 'workshop.job_card.view'], '/security/road-tests');
  const staffForCompanions = await loadStaffOptions();
  const { jobCardId, vehicleServiceId, error } = await searchParams;
  await requireUser();
  // Only a Job Card / Vehicle Service the person can see (never by a guessed id).
  try {
    if (jobCardId) await seeJobCard(jobCardId, 'NewRoadTestPage');
    else if (vehicleServiceId) await seeService(vehicleServiceId, 'NewRoadTestPage');
  } catch {
    notFound();
  }
  const rec = jobCardId
    ? await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { jobNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true, mileage: true } }, customer: { select: { fullName: true } } } }).then((j) => j && { number: j.jobNumber, vehicle: j.vehicle, customer: j.customer.fullName, back: `/workshop/job-cards/${jobCardId}` })
    : vehicleServiceId
      ? await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true, mileage: true } }, customer: { select: { fullName: true } } } }).then((v) => v && { number: v.serviceNumber, vehicle: v.vehicle, customer: v.customer.fullName, back: `/workshop/vehicle-service/${vehicleServiceId}` })
      : null;
  if (!rec) notFound();
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="road"
        back={{ href: rec.back, label: <>Back to {rec.number}</> }}
        title="Request a road test"
        description={<>{rec.number} · {[rec.vehicle.make, rec.vehicle.model].filter(Boolean).join(' ')}{rec.vehicle.plateNumber ? ` — ${rec.vehicle.plateNumber}` : ''} · {rec.customer}{rec.vehicle.mileage !== null ? ` · last odometer ${rec.vehicle.mileage.toLocaleString('en-NG')} km` : ''}</>}
      />
      <SecurityNav active="/security/road-tests" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <form action={requestRoadTestFormAction} className="max-w-2xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <FormPendingOverlay />
        {jobCardId ? <input type="hidden" name="jobCardId" value={jobCardId} /> : <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />}
        <div>
          <label className={label}>Driver (staff)</label>
          <SearchableSelect name="driverId" required search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name or ID…" emptyMessage="No active staff match." minQueryLength={1} />
        </div>
        <div><label className={label}>What the road test is checking</label><input name="purpose" required placeholder="e.g. brake repair — braking under load, noise" className={input} /></div>
        <div><label className={label}>Staff going along (optional — any number)</label>
          <select name="companionIds" multiple size={5} className={input} aria-describedby="companions-hint">
            {staffForCompanions.map((s) => <option key={s.value} value={s.value}>{s.label}{s.sublabel ? ` — ${s.sublabel}` : ''}</option>)}
          </select>
          <p id="companions-hint" className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Hold Ctrl (or ⌘) to choose more than one. The driver is already included.</p></div>
        <div><label className={label}>Other people going along (optional — one name per line)</label><textarea name="otherCompanions" rows={2} placeholder="e.g. Customer's representative" className={input} /></div>
        <div><label className={label}>Route (optional)</label><input name="route" placeholder="e.g. Isolo → Oshodi expressway and back" className={input} /></div>
        <div>
          <label className={label}>Expected duration</label>
          <select name="expectedMinutes" required defaultValue="" className={input}>
            <option value="" disabled>Choose…</option>
            {DURATIONS.map((m) => <option key={m} value={m}>{durationText(m)}</option>)}
          </select>
        </div>
        <p className="text-xs text-[var(--ejo-text-muted)]">The Manager approves it; Security records the odometer and time out and back. The vehicle&apos;s odometer is updated when it returns.</p>
        <SubmitButton label="Request approval" pendingLabel="Submitting…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
      </form>
    </div>
  );
}
