import { prisma } from '@ejo/database';
import { requireCustomer } from '@/lib/customer-portal/session';
import { fmtDate, initials } from '@/lib/customer-portal/format';
import { Card, KeyValue, PageHero, SectionTitle } from '@/components/customer/ui';
import { AddressManager, ChangePasswordForm, ContactForm, PreferencesForm } from '@/components/customer/ProfileForms';
import { Icon } from '@/components/customer/Icon';

export const metadata = { title: 'Profile & settings' };

const MAX_EXTRA_ADDRESSES = 5;

/** The customer's own details and settings. Name and email are changed by the branch. */
export default async function ProfilePage() {
  const me = await requireCustomer();
  const addresses = await prisma.customerAddress.findMany({
    where: { customerId: me.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, line1: true, line2: true, city: true, state: true, country: true },
  });
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Profile & settings" icon="user" title="Your details" subtitle="Keep your phone numbers and addresses up to date so we can reach you about your vehicle. Every change is recorded for your security." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ejo-accent)] to-[var(--ejo-primary-dark)] text-lg font-bold text-white shadow-sm">{initials(me.fullName)}</span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[var(--ejo-text)]">{me.fullName}</p>
                <p className="truncate text-sm text-[var(--ejo-text-muted)]">{me.email}</p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <KeyValue label="Account">{me.customerType === 'ORGANIZATION' ? 'Business' : 'Personal'}</KeyValue>
              <KeyValue label="Customer since">{fmtDate(me.createdAt)}</KeyValue>
              {me.companyName ? <KeyValue label="Company">{me.companyName}</KeyValue> : null}
            </dl>
            <p className="mt-5 flex gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-xs leading-relaxed text-[var(--ejo-text-muted)]">
              <span className="mt-0.5 shrink-0 text-[var(--ejo-info)]"><Icon name="info" size={14} /></span>
              To change your name or email address, please contact your branch — we confirm these in person to keep your account safe.
            </p>
          </Card>
          <Card className="p-5" delay={60}>
            <SectionTitle icon="bell" title="Notifications" />
            <PreferencesForm notifyByEmail={me.notifyByEmail} />
          </Card>
        </aside>

        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <SectionTitle icon="phone" title="Contact details" />
            <ContactForm phone={me.phone ?? ''} altPhone={me.altPhone ?? ''} address={me.address ?? ''} />
          </Card>
          <Card className="p-5 sm:p-6" delay={60}>
            <SectionTitle icon="pin" title={`Other addresses (${addresses.length}/${MAX_EXTRA_ADDRESSES})`} />
            <AddressManager addresses={addresses} max={MAX_EXTRA_ADDRESSES} />
          </Card>
          <Card className="p-5 sm:p-6" delay={120}>
            <SectionTitle icon="lock" title="Change password" />
            <p className="-mt-1 mb-4 text-sm text-[var(--ejo-text-muted)]">Changing it signs you out on your other devices.</p>
            <ChangePasswordForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
