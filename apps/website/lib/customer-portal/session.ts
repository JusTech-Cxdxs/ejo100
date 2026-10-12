import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, setAuditActorResolver } from '@ejo/database';
import { customerAuth } from '@/lib/auth-customer';
import { markCustomerActor } from '@/lib/customer-audit';

export type SignedInCustomer = {
  id: string;
  organisationId: string;
  fullName: string;
  email: string;
  phone: string | null;
  altPhone: string | null;
  address: string | null;
  notifyByEmail: boolean;
  customerType: string;
  createdAt: Date;
  companyName: string | null;
};

type Lookup = { state: 'ok'; customer: SignedInCustomer } | { state: 'none' } | { state: 'inactive' };

/**
 * Who is signed in — resolved once per request (React cache). The session
 * only tells us WHICH customer; everything shown is read fresh from the
 * customers table, and a switched-off account is refused on every request.
 */
export const lookupCustomer = cache(async (): Promise<Lookup> => {
  let session: Awaited<ReturnType<typeof customerAuth.api.getSession>> = null;
  try {
    session = await customerAuth.api.getSession({ headers: await headers() });
  } catch {
    session = null;
  }
  if (!session) return { state: 'none' };
  const c = await prisma.customer.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, organisationId: true, fullName: true, email: true, phone: true, altPhone: true, address: true,
      notifyByEmail: true, customerType: true, createdAt: true, isActive: true,
      customerCompany: { select: { companyName: true } },
    },
  });
  if (!c) return { state: 'none' };
  if (!c.isActive) return { state: 'inactive' };
  markCustomerActor(c.organisationId);
  return {
    state: 'ok',
    customer: {
      id: c.id, organisationId: c.organisationId, fullName: c.fullName, email: c.email, phone: c.phone, altPhone: c.altPhone,
      address: c.address, notifyByEmail: c.notifyByEmail, customerType: String(c.customerType), createdAt: c.createdAt,
      companyName: c.customerCompany?.companyName ?? null,
    },
  };
});

/** For pages and layouts: the signed-in, active customer — or off to sign in. */
export async function requireCustomer(): Promise<SignedInCustomer> {
  const r = await lookupCustomer();
  if (r.state === 'ok') return r.customer;
  redirect(`/customer-portal/session-ended?reason=${r.state === 'inactive' ? 'inactive' : 'expired'}`);
}

/** For server actions and API routes: the customer, or null (never redirects). */
export async function currentCustomer(): Promise<SignedInCustomer | null> {
  const r = await lookupCustomer();
  return r.state === 'ok' ? r.customer : null;
}

// Data-journal rows written while a customer is signed in belong to the
// customer's organisation (actor: the customer portal). Resolved from this
// request's cached lookup; null outside a request (E2E-09).
setAuditActorResolver(async () => {
  try {
    const r = await lookupCustomer();
    return r.state === 'ok' ? { userId: null, source: 'customer-portal', organisationId: r.customer.organisationId } : null;
  } catch {
    return null;
  }
});
