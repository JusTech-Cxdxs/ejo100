/** What a policy pays for and how the provider makes it right — shared by
 * the Add and Edit policy forms. */
export function PolicyCoverageFields({ coversParts = true, coversLabour = true, defaultRemedy = 'REIMBURSEMENT' }: { coversParts?: boolean; coversLabour?: boolean; defaultRemedy?: string }) {
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  return (
    <div className="space-y-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
      <p className="text-xs font-medium text-[var(--ejo-text-muted)]">What the provider pays for</p>
      <div className="flex flex-wrap gap-4 text-sm text-[var(--ejo-text)]">
        <label className="flex items-center gap-2"><input type="checkbox" name="coversParts" value="true" defaultChecked={coversParts} /> Parts</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="coversLabour" value="true" defaultChecked={coversLabour} /> Labour</label>
      </div>
      <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">How they usually make it right</label>
      <select name="defaultRemedy" defaultValue={defaultRemedy} className={input}>
        <option value="REIMBURSEMENT">Reimbursement — they pay or credit us</option>
        <option value="REPLACEMENT">Replacement — they send a new part</option>
        <option value="REPAIR">Repair — they repair the failed part and return it</option>
      </select>
      <p className="text-[11px] text-[var(--ejo-text-muted)]">A claim starts with this remedy; staff can change it per claim.</p>
    </div>
  );
}
