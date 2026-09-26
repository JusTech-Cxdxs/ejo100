/**
 * The claim form fields, shared by "Start a claim" and "Edit draft" so both
 * ask exactly the same things in the same way. The 3 C's are what every
 * provider reads first; the hints say what a strong answer contains.
 */
type Visit = { id: string; label: string };

export function WarrantyClaimFields({
  defaults,
  jobCards,
  vehicleServices,
}: {
  defaults: {
    complaint?: string;
    cause?: string;
    correction?: string;
    causalPart?: string;
    causalPartNumber?: string | null;
    failureDate?: string;
    failureReading?: number | null;
    labourAmount?: number;
    partsAmount?: number;
    otherAmount?: number;
    jobCardId?: string | null;
    vehicleServiceId?: string | null;
  };
  jobCards: Visit[];
  vehicleServices: Visit[];
}) {
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const hint = 'mt-1 text-[11px] text-[var(--ejo-text-muted)]';
  return (
    <div className="space-y-4">
      <div>
        <label className={label}>1. Complaint — what the customer reported</label>
        <textarea name="complaint" rows={2} required defaultValue={defaults.complaint ?? ''} className={input} placeholder="e.g. Battery warning light on; vehicle would not start after short trips" />
        <p className={hint}>In the customer&apos;s words: the symptom, when it happens, how often.</p>
      </div>
      <div>
        <label className={label}>2. Cause — what the technician found</label>
        <textarea name="cause" rows={2} defaultValue={defaults.cause ?? ''} className={input} placeholder="e.g. Alternator output 11.8 V at 2,000 rpm; internal diode failure confirmed on bench test" />
        <p className={hint}>The root cause and how it was proven (tests, readings, fault codes). Say if misuse, accident or wrong fluids were ruled out.</p>
      </div>
      <div>
        <label className={label}>3. Correction — what was done to fix it</label>
        <textarea name="correction" rows={2} defaultValue={defaults.correction ?? ''} className={input} placeholder="e.g. Replaced alternator assembly; output 14.2 V confirmed; road tested OK" />
        <p className={hint}>What was replaced or repaired, and how the fix was verified.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Causal part</label><input name="causalPart" defaultValue={defaults.causalPart ?? ''} className={input} placeholder="e.g. Alternator assembly" /></div>
        <div><label className={label}>Causal part number</label><input name="causalPartNumber" defaultValue={defaults.causalPartNumber ?? ''} className={input} placeholder="e.g. ALT-001" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Failure date</label><input type="date" name="failureDate" required defaultValue={defaults.failureDate ?? ''} className={input} /></div>
        <div><label className={label}>Odometer at failure (km)</label><input type="number" name="failureReading" min={0} defaultValue={defaults.failureReading ?? ''} className={input} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={label}>Labour (₦)</label><input type="number" name="labourAmount" min={0} step="0.01" defaultValue={defaults.labourAmount ?? 0} className={input} /></div>
        <div><label className={label}>Parts (₦)</label><input type="number" name="partsAmount" min={0} step="0.01" defaultValue={defaults.partsAmount ?? 0} className={input} /></div>
        <div><label className={label}>Other (₦)</label><input type="number" name="otherAmount" min={0} step="0.01" defaultValue={defaults.otherAmount ?? 0} className={input} /></div>
      </div>
      <p className={hint}>The total claimed is labour + parts + other. Oil and fluids used in a warranty repair belong under Other.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Repair record — Job Card</label>
          <select name="jobCardId" defaultValue={defaults.jobCardId ?? ''} className={input}>
            <option value="">— none —</option>
            {jobCards.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>…or Vehicle Service</label>
          <select name="vehicleServiceId" defaultValue={defaults.vehicleServiceId ?? ''} className={input}>
            <option value="">— none —</option>
            {vehicleServices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
