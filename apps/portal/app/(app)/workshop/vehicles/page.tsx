import Link from 'next/link';
import { listAllVehicles, listCustomers } from '@/lib/actions/workshop';
import { createVehicleFormAction } from '@/lib/actions/workshop-form-handlers';

export default async function WorkshopVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [vehicles, customers] = await Promise.all([listAllVehicles(q), listCustomers()]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicles</h1>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
        </p>
      </div>

      <form className="mb-6 flex gap-2" action="/workshop/vehicles">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by plate, chassis/VIN, make, or model…"
          className="w-full max-w-sm rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-hidden">
          {vehicles.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              No vehicles registered yet.{customers.length === 0 ? ' Add a customer first, then register their vehicle.' : ''}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Plate / Chassis</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Mileage</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v: (typeof vehicles)[number]) => (
                  <tr key={v.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">
                      {v.plateNumber || v.chassisNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{v.customer.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {v.mileage != null ? `${v.mileage.toLocaleString()} km` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Register vehicle</h2>
          {customers.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
              Add a customer first — every vehicle must belong to one.{' '}
              <Link href="/workshop/customers" className="text-[var(--ejo-primary)] underline">
                Go to Customers
              </Link>
            </p>
          ) : (
            <form action={createVehicleFormAction} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Owner</label>
                <select
                  name="customerId"
                  required
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                >
                  {customers.map((c: (typeof customers)[number]) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Make</label>
                  <input name="make" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Model</label>
                  <input name="model" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Year</label>
                  <input name="year" type="number" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage (km)</label>
                  <input name="mileage" type="number" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Plate number</label>
                <input name="plateNumber" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Chassis / VIN</label>
                <input name="chassisNumber" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
              </div>
              <button
                type="submit"
                className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Register vehicle
              </button>
            </form>
          )}
        </div>
      </div>

      <Link
        href="/workshop"
        className="mt-6 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </Link>
    </div>
  );
}
