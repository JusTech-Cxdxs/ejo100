import Link from 'next/link';
import { listCustomers } from '@/lib/actions/workshop';
import { createCustomerFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const STATUS_MESSAGES: Record<string, { kind: 'success' | 'warning'; message: string }> = {
  customer_existing: { kind: 'success', message: 'That email already had a customer record — reused it, no duplicate created.' },
  customer_created_emailed: { kind: 'success', message: 'Customer added — a welcome email with their login details has been sent.' },
  customer_created_no_email: { kind: 'warning', message: 'Customer added, but the welcome email could not be sent. Please share their login details manually, or try resending later.' },
};

export default async function WorkshopCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  const { q, status, error } = await searchParams;
  const customers = await listCustomers(q);
  const statusInfo = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Customers</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
          </p>
        </div>
      </div>

      {statusInfo ? <FormFeedbackBanner kind={statusInfo.kind} message={statusInfo.message} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <form className="mb-6 flex gap-2" action="/workshop/customers">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name, email, or phone…"
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
          {customers.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              No customers yet. Add the first one using the form on the right.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Vehicles</th>
                  <th className="px-4 py-3 font-medium">Job Cards</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: (typeof customers)[number]) => (
                  <tr key={c.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">{c.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {c.email}
                      {c.phone ? <><br />{c.phone}</> : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{c._count.vehicles}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{c._count.jobCards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add customer</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            If the email already belongs to an existing customer, their existing record is reused —
            no duplicate is created. A new customer receives a welcome email with login details.
          </p>
          <form action={createCustomerFormAction} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Full name</label>
              <input
                name="fullName"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Email</label>
              <input
                name="email"
                type="email"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Phone</label>
              <input
                name="phone"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <SubmitButton
              label="Add customer"
              pendingLabel="Adding…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
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
