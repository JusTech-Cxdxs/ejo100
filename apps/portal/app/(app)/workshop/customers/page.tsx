import { FormJumpLink } from '@/components/ui/FormJumpLink';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { redirect } from 'next/navigation';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { listCustomers } from '@/lib/actions/workshop';
import { createCustomerFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { PageHeader } from '@/components/ui';

const STATUS_MESSAGES: Record<string, { kind: 'success' | 'warning'; message: string }> = {
  customer_existing: { kind: 'success', message: 'That email already had a customer record — reused it, no duplicate created.' },
  customer_created_emailed: { kind: 'success', message: 'Customer added — a welcome email with a link to set their password has been sent.' },
  customer_created_no_email: { kind: 'warning', message: 'Customer added, but the welcome email could not be sent. Send the set-password link again from their customer page once email is working.' },
};

export default async function WorkshopCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { q, status, error } = await searchParams;
  // The Customers (CRM) hub is the home of customers now — this address leads there.
  if (await allows('crm.view')) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (error) qs.set('error', error);
    redirect(`/crm${qs.size ? `?${qs.toString()}` : ''}`);
  }
  const customers = await listCustomers(q);
  const statusInfo = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <div className="p-8">
      <PageHeader
        icon="users"
        back={{ href: "/workshop", label: "Back to Workshop" }}
        title="Customers"
        description={<><OrgTrail area="Workshop" /></>}
      />

      {statusInfo ? <FormFeedbackBanner kind={statusInfo.kind} message={statusInfo.message} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <form className="mb-6 flex gap-2" action="/workshop/customers">
        <LiveSearchInput
          type="search" name="q"
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

      <FormJumpLink target="add-customer">New customer</FormJumpLink>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
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
                  <th className="px-4 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: (typeof customers)[number]) => (
                  <tr key={c.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--ejo-text)]">{c.fullName}</td>
                    <td data-label="Contact" className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {c.email}
                      {c.phone ? <><br />{c.phone}</> : null}
                    </td>
                    <td data-label="Vehicles" className="px-4 py-3 text-[var(--ejo-text-muted)]">{c._count.vehicles}</td>
                    <td data-label="Job Cards" className="px-4 py-3 text-[var(--ejo-text-muted)]">{c._count.jobCards}</td>
                    <td data-label="Registered" className="px-4 py-3 text-xs text-[var(--ejo-text-muted)]">
                      {formatDateTimeCompact(c.createdAt)}
                      {c.createdBy ? <><br />by {c.createdBy.fullName}</> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ResponsiveTable>

        <div id="add-customer" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 xl:sticky xl:top-6 scroll-mt-20">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add customer</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            If the email already belongs to an existing customer, their existing record is reused —
            no duplicate is created. A new customer receives a welcome email with a link to set their own password.
          </p>
          <form action={createCustomerFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer type</label>
              <select
                name="customerType"
                required
                defaultValue="INDIVIDUAL"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="ORGANIZATION">Organization</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Full name / Organization name</label>
              <input
                name="fullName"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Primary address</label>
              <input
                name="address"
                required
                maxLength={80}
                placeholder="e.g. Plot 3, Cheesebrough, Lagos"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
              <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
                Keep it brief (like a VIN) — this shows directly on the Job Card, up to 80 characters.
              </p>
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
                required
                type="tel"
                minLength={7}
                maxLength={20}
                pattern="\+?[0-9 ]{7,20}"
                title="Digits, spaces and a leading + (7–20 characters)"
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
    </div>
  );
}
