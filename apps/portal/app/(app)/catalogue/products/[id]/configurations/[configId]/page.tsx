import { notFound } from 'next/navigation';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { getConfiguration, searchPartsForBom, searchSoftwarePackagesForSelect } from '@/lib/actions/catalogue';
import { addBomLineFormAction, removeBomLineFormAction, removeConfigurationPackageFormAction, setConfigurationPackageFormAction, updateConfigurationFormAction } from '@/lib/actions/catalogue-form-handlers';
import { specLines, STATION_LABEL, STATIONS, type Station } from '@/lib/catalogue-core';
import { formatCurrency } from '@ejo/utils';
import { LoadingLink } from '@/components/LoadingLink';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BackLink, PageTitle, ResponsiveTable, RevealPanel, SectionCard, StatusChip } from '@/components/ui';
import { btn, btnLine, btnSmall, input, label, tableHead, tableRow, td, th } from '@/components/production/styles';

const BANNER: Record<string, string> = {
  configuration_created: 'Configuration added — now build its bill of materials.',
  configuration_updated: 'Configuration saved.',
  bom_line_added: 'Part added to the bill of materials.',
  bom_line_removed: 'Part removed from the bill of materials.',
  package_set: 'Software package set.',
  package_removed: 'Software package removed.',
};

/** The BOM editor: the parts per unit (with station and quantity), the software packages, and the cost roll-up. */
export default async function ConfigurationPage({ params, searchParams }: { params: Promise<{ id: string; configId: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardAnyPage(['catalogue.view'], '/catalogue/products/[id]/configurations/[configId]');
  const { id, configId } = await params;
  const { status, error, edit } = await searchParams;
  const [c, canManage] = await Promise.all([getConfiguration(configId), allows('catalogue.manage')]);
  // The cost roll-up (purchase costs) is for the people who manage the catalogue.
  const canSeeCosts = canManage;
  if (!c || c.product.id !== id) notFound();
  const editing = edit === '1' && canManage;
  const base = `/catalogue/products/${id}/configurations/${c.id}`;
  const specs = Object.entries(c.specs);
  return (
    <div className="w-full p-4 sm:p-8">
      <BackLink href={`/catalogue/products/${id}`} label={`Back to ${c.product.name}`} />
      {status && BANNER[status] ? <FormFeedbackBanner kind="success" message={BANNER[status]} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="sliders">{c.product.name} — {c.name}</PageTitle>
          <p className="mt-1 font-mono text-sm text-[var(--ejo-text-muted)]">{c.product.sku}-{c.code}{c.isDefault ? ' · default configuration' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={c.isActive ? 'ACTIVE' : 'INACTIVE'} label={c.isActive ? 'Active' : 'Retired'} className="px-3 py-1 text-sm" />
          {canManage && !editing ? <LoadingLink href={`${base}?edit=1`} className={btnLine}>Edit</LoadingLink> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateConfigurationFormAction} className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-6">
              <FormPendingOverlay />
              <input type="hidden" name="productId" value={id} />
              <input type="hidden" name="configurationId" value={c.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className={label} htmlFor="code">Code</label><input id="code" name="code" required defaultValue={c.code} className={`${input} uppercase`} maxLength={20} /></div>
                <div><label className={label} htmlFor="name">Name</label><input id="name" name="name" required defaultValue={c.name} className={input} maxLength={120} /></div>
                <div className="sm:col-span-2"><label className={label} htmlFor="specsText">What differs</label><textarea id="specsText" name="specsText" rows={4} defaultValue={specLines(c.specs)} className={`${input} font-mono text-xs`} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={c.isDefault} className="h-4 w-4" /> Default configuration</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="retire" defaultChecked={!c.isActive} className="h-4 w-4" /> Retired (not offered on new orders)</label>
              </div>
              <div className="flex gap-2">
                <SubmitButton label="Save" pendingLabel="Saving…" className={btn} />
                <LoadingLink href={base} className={btnLine}>Cancel</LoadingLink>
              </div>
            </form>
          ) : specs.length ? (
            <SectionCard icon="list" title="What differs in this configuration">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {specs.map(([k, v]) => <div key={k} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2"><dt className="text-xs text-[var(--ejo-text-muted)]">{k}</dt><dd>{v || '—'}</dd></div>)}
              </dl>
            </SectionCard>
          ) : null}

          <SectionCard icon="boxes" title="Bill of materials" description="Parts per unit, from the components warehouse, and the station that fits them." flush>
            {c.bomLines.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[var(--ejo-text-muted)]">No parts yet{canManage ? ' — add the first line below.' : '.'}</p>
            ) : (
              <ResponsiveTable flush>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={tableHead}>
                      <th className={th}>Part</th>
                      <th className={th}>Station</th>
                      <th className={`${th} text-right`}>Per unit</th>
                      <th className={`${th} text-right`}>In stock</th>
                      {canSeeCosts ? <th className={`${th} text-right`}>Latest cost</th> : null}
                      {canSeeCosts ? <th className={`${th} text-right`}>Line cost</th> : null}
                      {canManage ? <th className={th} /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {c.bomLines.map((l: (typeof c.bomLines)[number]) => (
                      <tr key={l.id} className={tableRow}>
                        <td className={td}>
                          <span className="font-medium text-[var(--ejo-text)]">{l.part.name}</span>
                          <div className="text-xs text-[var(--ejo-text-muted)]">{[l.part.partNumber, l.isOptional ? 'optional' : null, l.notes].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td data-label="Station" className={td}>{STATION_LABEL[l.station as Station] ?? l.station}</td>
                        <td data-label="Per unit" className={`${td} text-right tabular-nums`}>{l.quantity} {l.part.baseUnitOfMeasure}</td>
                        <td data-label="In stock" className={`${td} text-right tabular-nums`}>{Number(l.part.stock?.quantityOnHand ?? 0) - Number(l.part.stock?.quantityReserved ?? 0)}</td>
                        {canSeeCosts ? <td data-label="Latest cost" className={`${td} text-right tabular-nums`}>{l.unitCost === null ? <span className="text-[var(--ejo-warning-text)]">not received yet</span> : formatCurrency(l.unitCost, 'NGN')}</td> : null}
                        {canSeeCosts ? <td data-label="Line cost" className={`${td} text-right tabular-nums`}>{l.lineCost === null ? '—' : formatCurrency(l.lineCost, 'NGN')}</td> : null}
                        {canManage ? (
                          <td data-actions className={`${td} text-right`}>
                            <form action={removeBomLineFormAction}>
                              <input type="hidden" name="productId" value={id} />
                              <input type="hidden" name="configurationId" value={c.id} />
                              <input type="hidden" name="partId" value={l.partId} />
                              <SubmitButton label="Remove" pendingLabel="…" className={btnSmall} ariaLabel={`Remove ${l.part.name}`} />
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
            {canSeeCosts ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ejo-border)] px-5 py-3 text-sm">
                <span className="text-[var(--ejo-text-muted)]">Cost roll-up per unit (latest goods-receipt cost; parts never received count as ₦0)</span>
                <span className="font-semibold tabular-nums text-[var(--ejo-text)]">{formatCurrency(c.cost.total, 'NGN')}{c.cost.unpriced ? <span className="ml-2 text-xs font-normal text-[var(--ejo-warning-text)]">{c.cost.unpriced} {c.cost.unpriced === 1 ? 'part' : 'parts'} unpriced</span> : null}</span>
              </div>
            ) : null}
            {canManage ? (
              <div className="border-t border-[var(--ejo-border)] p-4">
                <RevealPanel label="Add a part" open={Boolean(error && /part|quantity|station/i.test(error))}>
                  <form action={addBomLineFormAction} className="space-y-4">
                    <FormPendingOverlay />
                    <input type="hidden" name="productId" value={id} />
                    <input type="hidden" name="configurationId" value={c.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className={label} htmlFor="partId">Part</label>
                        <SearchableSelect id="partId" name="partId" required search={searchPartsForBom} loadDefaultOptions={searchPartsForBom.bind(null, '')} defaultOptionsLabel="Parts" placeholder="Search parts by name or number…" minQueryLength={0} />
                      </div>
                      <div><label className={label} htmlFor="quantity">Quantity per unit</label><input id="quantity" name="quantity" type="number" step="0.001" min="0.001" required defaultValue="1" className={input} /></div>
                      <div>
                        <label className={label} htmlFor="station">Station</label>
                        <select id="station" name="station" className={input} defaultValue="ASSEMBLY">{STATIONS.map((s) => <option key={s} value={s}>{STATION_LABEL[s]}</option>)}</select>
                      </div>
                      <div className="sm:col-span-2"><label className={label} htmlFor="notes">Note (optional)</label><input id="notes" name="notes" className={input} maxLength={300} placeholder="e.g. fit after the display cable" /></div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isOptional" className="h-4 w-4" /> Optional (never blocks a release)</label>
                    </div>
                    <SubmitButton label="Add part" pendingLabel="Adding…" className={btn} />
                  </form>
                </RevealPanel>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard icon="layers" title="Software packages" description="What the line installs on every unit of this configuration and the supervisor confirms.">
            {c.packages.length === 0 ? (
              <p className="text-sm text-[var(--ejo-text-muted)]">No packages yet{canManage ? ' — add the image and applications below.' : '.'}</p>
            ) : (
              <ul className="divide-y divide-[var(--ejo-border)]">
                {c.packages.map((x: (typeof c.packages)[number]) => (
                  <li key={x.packageId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-[var(--ejo-text)]">{x.package.name}</span>{x.package.version ? <span className="text-[var(--ejo-text-muted)]"> {x.package.version}</span> : null}
                      <div className="text-xs text-[var(--ejo-text-muted)]">{x.package.kind.toLowerCase()}{x.package.licenceRequired ? ' · licence required' : ''}{x.required ? '' : ' · optional'}</div>
                    </div>
                    {canManage ? (
                      <form action={removeConfigurationPackageFormAction}>
                        <input type="hidden" name="productId" value={id} />
                        <input type="hidden" name="configurationId" value={c.id} />
                        <input type="hidden" name="packageId" value={x.packageId} />
                        <SubmitButton label="Remove" pendingLabel="…" className={btnSmall} ariaLabel={`Remove ${x.package.name}`} />
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManage ? (
              <RevealPanel label="Add a software package" className="mt-4" open={Boolean(error && /package/i.test(error))}>
                <form action={setConfigurationPackageFormAction} className="space-y-4">
                  <FormPendingOverlay />
                  <input type="hidden" name="productId" value={id} />
                  <input type="hidden" name="configurationId" value={c.id} />
                  <div>
                    <label className={label} htmlFor="packageId">Package</label>
                    <SearchableSelect id="packageId" name="packageId" required search={searchSoftwarePackagesForSelect} loadDefaultOptions={searchSoftwarePackagesForSelect.bind(null, '')} defaultOptionsLabel="Packages" placeholder="Search software packages…" minQueryLength={0} />
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="optional" className="h-4 w-4" /> Optional on this configuration</label>
                  <SubmitButton label="Add package" pendingLabel="Adding…" className={btn} />
                </form>
              </RevealPanel>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">In use</h2>
            <dl className="mt-2 space-y-1 text-[var(--ejo-text-muted)]">
              <div className="flex justify-between"><dt>Build orders</dt><dd className="tabular-nums text-[var(--ejo-text)]">{c._count.buildOrders}</dd></div>
              <div className="flex justify-between"><dt>Units built</dt><dd className="tabular-nums text-[var(--ejo-text)]">{c._count.productionUnits}</dd></div>
              <div className="flex justify-between"><dt>Finished units</dt><dd className="tabular-nums text-[var(--ejo-text)]">{c._count.finishedUnits}</dd></div>
            </dl>
            <LoadingLink href={`/production/build-orders/new?configurationId=${c.id}`} className="mt-3 inline-block text-sm font-medium text-[var(--ejo-primary)] hover:underline">Plan a build order →</LoadingLink>
          </div>
        </div>
      </div>
    </div>
  );
}
