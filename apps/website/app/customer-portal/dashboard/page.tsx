import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { customerAuth } from '@/lib/auth-customer';
import { prisma } from '@ejo/database';
import { siteConfig } from '@/lib/site-config';

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  CHECKED_IN: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  IN_PROGRESS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  AWAITING_PARTS: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  QUALITY_CHECK: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  READY_FOR_COLLECTION: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CLOSED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/**
 * Real customer content — replaces the placeholder. Customers reach
 * this page only after signing in (middleware.ts checks for the
 * session cookie's presence), but that's only an optimistic check, not
 * full validation, per middleware.ts's own comment — this page is
 * where the session is actually resolved and trusted.
 *
 * Session data is used only to identify WHICH customer this is
 * (session.user.id); everything actually shown is fetched fresh from
 * Prisma using that id, not read from the session object's own display
 * fields — the same "don't trust Better Auth's own returned fields for
 * display data, query the real table directly" pattern already
 * established and proven necessary on the employee portal side.
 */
export default async function CustomerDashboardPage() {
  const session = await customerAuth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/customer-portal');
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.user.id },
    include: {
      vehicles: { orderBy: { createdAt: 'desc' } },
      jobCards: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          vehicle: { select: { make: true, model: true, plateNumber: true } },
          complaints: { orderBy: { sequenceNumber: 'asc' } },
        },
      },
    },
  });

  if (!customer) {
    // The session resolved to a customer id that no longer exists —
    // shouldn't happen in normal use, but fail safely rather than crash.
    redirect('/customer-portal');
  }

  const activeJobCards = customer.jobCards.filter(
    (jc: (typeof customer.jobCards)[number]) => jc.status !== 'CLOSED' && jc.status !== 'CANCELLED',
  );

  return (
    <main className="mx-auto max-w-5xl px-6 pt-32 pb-24">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Welcome back, {customer.fullName}</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
        Your vehicles and service history with {siteConfig.companyName}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <p className="text-3xl font-bold text-[var(--ejo-text)]">{activeJobCards.length}</p>
          <p className="text-sm text-[var(--ejo-text-muted)]">Active service{activeJobCards.length === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <p className="text-3xl font-bold text-[var(--ejo-text)]">{customer.vehicles.length}</p>
          <p className="text-sm text-[var(--ejo-text-muted)]">Registered vehicle{customer.vehicles.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--ejo-text)]">Your vehicles</h2>
        {customer.vehicles.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">
            No vehicles registered yet — a Kewalram staff member will register your vehicle the first time you
            bring it in for service.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {customer.vehicles.map((v: (typeof customer.vehicles)[number]) => (
              <div key={v.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
                <p className="font-medium text-[var(--ejo-text)]">
                  {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                </p>
                <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
                  {v.plateNumber || v.chassisNumber || 'No plate/VIN on file'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--ejo-text)]">Service history</h2>
        {customer.jobCards.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">
            No service visits yet — this will show your Job Cards once your vehicle has been checked in.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {customer.jobCards.map((jc: (typeof customer.jobCards)[number]) => (
              <div key={jc.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--ejo-text)]">{jc.jobNumber}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[jc.status]}`}>
                    {STATUS_LABEL[jc.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
                  {[jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                  {jc.vehicle.plateNumber ? ` — ${jc.vehicle.plateNumber}` : ''}
                </p>
                {jc.complaints.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-sm text-[var(--ejo-text)]">
                    {jc.complaints.map((c: (typeof jc.complaints)[number]) => (
                      <li key={c.id}>
                        {c.sequenceNumber}. {c.description}
                      </li>
                    ))}
                  </ul>
                ) : jc.complaint ? (
                  <p className="mt-2 text-sm text-[var(--ejo-text)]">{jc.complaint}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
