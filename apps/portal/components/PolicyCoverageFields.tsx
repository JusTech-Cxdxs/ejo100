/** What a policy pays for and how the provider makes it right — shared by
 * the Add and Edit policy forms. On Add (blank) the remedy starts empty so
 * it is a deliberate choice; on Edit it shows the current value. */
export function PolicyCoverageFields({
  coversParts = true,
  coversLabour = true,
  coversLogistics = false,
  defaultRemedy,
}: {
  coversParts?: boolean;
  coversLabour?: boolean;
  coversLogistics?: boolean;
  defaultRemedy?: string;
}) {
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  return (
    <div className="space-y-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
      <p className="text-xs font-medium text-[var(--ejo-text-muted)]">What the provider pays for</p>
      <div className="flex flex-wrap gap-4 text-sm text-[var(--ejo-text)]">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--ejo-success)]" name="coversParts" value="true" defaultChecked={coversParts} /> Parts</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--ejo-success)]" name="coversLabour" value="true" defaultChecked={coversLabour} /> Labour</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--ejo-success)]" name="coversLogistics" value="true" defaultChecked={coversLogistics} /> Logistics (freight)</label>
      </div>
      <p className="text-[11px] text-[var(--ejo-text-muted)]">Logistics = shipping the replacement in and the failed part back.</p>
      <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">How they usually make it right</label>
      <select name="defaultRemedy" required defaultValue={defaultRemedy ?? ''} className={input}>
        <option value="" disabled>Choose a remedy…</option>
        <option value="REIMBURSEMENT">Reimbursement — they pay or credit us</option>
        <option value="REPLACEMENT">Replacement — they send a new part</option>
        <option value="REPAIR">Repair — they repair the failed part and return it</option>
      </select>
      <p className="text-[11px] text-[var(--ejo-text-muted)]">A claim starts with this remedy; staff can change it per claim.</p>
    </div>
  );
}
