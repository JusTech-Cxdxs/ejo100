import { allows, guardAnyPage } from '@/lib/authz/server';
import { listFgLocations, listWarehouseBranches } from '@/lib/actions/warehouse';
import { createFgLocationFormAction, setFgLocationActiveFormAction } from '@/lib/actions/warehouse-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, RevealPanel, StatusChip } from '@/components/ui';
import { FG_LOCATION_KINDS, FG_LOCATION_KIND_LABEL } from '@/lib/warehouse-core';
import { Banners, BTN, BTN_LINE, INPUT, LABEL, LINK, TABLE_WRAP, TD, TD_MUTED, TH } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { location_created: 'Location added.', location_retired: 'Location retired — nothing can be put there now.', location_reactivated: 'Location reactivated.' };

/** Finished-goods locations: stores, showroom floor, consignment, transit, service and quarantine. */
export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/locations');
  const { status, error } = await searchParams;
  const [locations, branches, canManage] = await Promise.all([listFgLocations({ includeRetired: true }), listWarehouseBranches(), allows('warehouse.manage')]);
  return (
    <div className="p-8">
      <PageHeader icon="pin" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Locations" description="Where finished units are held. A unit is always in exactly one location." />
      <Banners status={status} error={error} map={BANNER} />

      {canManage ? (
        <div className="mb-6 max-w-2xl">
          <RevealPanel label="Add a location" open={Boolean(error)}>
            <form action={createFgLocationFormAction} className="relative space-y-4 p-4">
              <FormPendingOverlay />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={LABEL}>Name<input name="name" required maxLength={80} className={`${INPUT} mt-1`} placeholder="e.g. Gbagada FG store" /></label>
                <label className={LABEL}>Kind
                  <select name="kind" className={`${INPUT} mt-1`} defaultValue="WAREHOUSE">
                    {FG_LOCATION_KINDS.map((k) => <option key={k} value={k}>{FG_LOCATION_KIND_LABEL[k]}</option>)}
                  </select>
                </label>
                {branches.length > 1 ? (
                  <label className={LABEL}>Branch
                    <select name="branchId" className={`${INPUT} mt-1`} defaultValue="">
                      <option value="">My branch</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
              <SubmitButton label="Add location" pendingLabel="Adding…" className={BTN} />
            </form>
          </RevealPanel>
        </div>
      ) : null}

      {locations.length === 0 ? (
        <EmptyState icon="pin" title="No locations yet.">{canManage ? 'Add the finished goods store, the showroom floor and a quarantine location to start.' : 'The Warehouse Manager sets locations up.'}</EmptyState>
      ) : (
        <ResponsiveTable className={TABLE_WRAP}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Location</th><th className={TH}>Kind</th><th className={TH}>Branch</th><th className={TH}>Units held</th><th className={TH}>Status</th>{canManage ? <th className={TH}></th> : null}</tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className={`${TD} font-medium`}><LoadingLink href={`/warehouse/finished-goods?locationId=${l.id}`} className={LINK}>{l.name}</LoadingLink></td>
                  <td data-label="Kind" className={TD_MUTED}>{FG_LOCATION_KIND_LABEL[l.kind]}</td>
                  <td data-label="Branch" className={TD_MUTED}>{l.branch.name}</td>
                  <td data-label="Units held" className={TD}>{l._count.units}</td>
                  <td data-label="Status" className={TD}><StatusChip status={l.isActive ? 'ACTIVE' : 'INACTIVE'} label={l.isActive ? 'Active' : 'Retired'} /></td>
                  {canManage ? (
                    <td data-label="" className={TD}>
                      <form action={setFgLocationActiveFormAction} className="relative inline-block">
                        <FormPendingOverlay />
                        <input type="hidden" name="locationId" value={l.id} />
                        <input type="hidden" name="active" value={l.isActive ? '0' : '1'} />
                        <SubmitButton label={l.isActive ? 'Retire' : 'Reactivate'} pendingLabel="Saving…" className={`${BTN_LINE} px-3 py-1 text-xs`} ariaLabel={`${l.isActive ? 'Retire' : 'Reactivate'} ${l.name}`} />
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
