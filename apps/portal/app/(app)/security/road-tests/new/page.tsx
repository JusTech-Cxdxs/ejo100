import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { requireUser } from '@/lib/actions/workshop';
import { requestRoadTestFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { durationText } from '@/lib/security-rules';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export default async function NewRoadTestPage({ searchParams }: { searchParams: Promise<{ jobCardId?: string; vehicleServiceId?: string; error?: string }> }) {
  const { jobCardId, vehicleServiceId, error } = await searchParams;
  await requireUser();
  const rec = jobCardId
    ? await prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { jobNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true, mileage: true } }, customer: { select: { fullName: true } } } }).then((j) => j && { number: j.jobNumber, vehicle: j.vehicle, customer: j.customer.fullName, back: `/workshop/job-cards/${jobCardId}` })
    : vehicleServiceId
      ? await prisma.vehicleService.findUnique({ where: { id: vehicleServiceId }, select: { serviceNumber: true, vehicle: { select: { make: true, model: true, plateNumber: true, mileage: true } }, customer: { select: { fullName: true } } } }).then((v) => v && { number: v.serviceNumber, vehicle: v.vehicle, customer: v.customer.fullName, back: `/workshop/vehicle-service/${vehicleServiceId}` })
      : null;
  if (!rec) notFound();
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  return (
    <div className="p-8">
      <LoadingLink href={rec.back} className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to {rec.number}</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Request a road test</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">{rec.number} · {[rec.vehicle.make, rec.vehicle.model].filter(Boolean).join(' ')}{rec.vehicle.plateNumber ? ` — ${rec.vehicle.plateNumber}` : ''} · {rec.customer}{rec.vehicle.mileage !== null ? ` · last odometer ${rec.vehicle.mileage.toLocaleString('en-NG')} km` : ''}</p>
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
