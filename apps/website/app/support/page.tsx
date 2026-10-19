import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@ejo/database';
import { siteOrganisation } from '@/lib/enyo/settings';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'Customer support', description: 'How to reach our support teams: email, chat with our assistant, your customer portal, or a call.' };
export const revalidate = 300;

const KIND_TEXT: Record<string, string> = {
  general: 'Questions, bookings and anything else',
  warranty: 'Warranty claims and recalls',
  technical: 'Technical questions about your vehicle and repairs',
  customer_care: 'Complaints and feedback',
  parts: 'Parts availability and orders',
  sales: 'Buying a vehicle',
  other: 'Other requests',
};
const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Customer support: the teams and their addresses, opening hours, chat, the customer portal and branch phones — from the organisation's own set-up. */
export default async function SupportPage() {
  const org = await siteOrganisation().catch(() => null);
  const [queues, setting, branches] = org ? await Promise.all([
    prisma.supportQueue.findMany({ where: { organisationId: org.id, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, kind: true, description: true, mailboxes: { where: { status: { not: 'PAUSED' } }, select: { address: true } } } }),
    prisma.supportSetting.findUnique({ where: { organisationId: org.id }, select: { hours: true } }),
    prisma.branch.findMany({ where: { isActive: true, businessUnit: { organisationId: org.id, isActive: true } }, orderBy: { name: 'asc' }, take: 20, select: { id: true, name: true, hotlines: true, email: true } }),
  ]).catch(() => [[], null, []] as const) : [[], null, []] as const;
  const hours = (setting?.hours && typeof setting.hours === 'object' ? setting.hours : { 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['09:00', '13:00'] }) as Record<string, [string, string]>;
  const withEmail = queues.filter((q) => q.mailboxes.length);
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6 lg:px-10 sm:pb-24 sm:pt-32">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ejo-primary-dark)]">{org?.name ?? siteConfig.organisationName}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">How can we help?</h1>
      <p className="mt-3 max-w-2xl text-base text-slate-600">Write to the right team, chat with our assistant any time, or follow your vehicle in the customer portal. Every request gets a reference number and a promised answer time.</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Chat now</h2><p className="mt-1 text-sm text-slate-600">Our assistant answers straight away, day and night, and hands you to a person when you ask. Use the chat button at the bottom of the page.</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Your customer portal</h2><p className="mt-1 text-sm text-slate-600">See your vehicles, estimates, payments and requests, and reply to our team.</p><Link href="/customer-portal" className="mt-3 inline-flex text-sm font-semibold text-[var(--ejo-primary-dark)] underline">Open the portal</Link></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Opening hours</h2>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">{[1, 2, 3, 4, 5, 6, 7].map((d) => <li key={d} className="flex justify-between gap-3"><span>{DAY[d]}</span><span>{hours[String(d)] ? `${hours[String(d)]![0]}–${hours[String(d)]![1]}` : 'Closed'}</span></li>)}</ul>
        </div>
      </div>

      {withEmail.length ? (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-slate-900">Write to the right team</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {withEmail.map((q) => (
              <li key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="font-semibold text-slate-900">{q.name}</p>
                <p className="mt-0.5 text-sm text-slate-600">{q.description || KIND_TEXT[q.kind] || ''}</p>
                {q.mailboxes.map((m) => <a key={m.address} href={`mailto:${m.address}`} className="mt-2 block break-all text-sm font-semibold text-[var(--ejo-primary-dark)] underline">{m.address}</a>)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500">If your vehicle is unsafe to drive or you are stranded, please call your branch now instead of emailing.</p>
        </section>
      ) : null}

      {branches.length ? (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-slate-900">Call a branch</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <li key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="font-semibold text-slate-900">{b.name}</p>
                {b.hotlines.map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, '')}`} className="mt-1 block text-sm text-[var(--ejo-primary-dark)] underline">{p}</a>)}
                {b.email ? <a href={`mailto:${b.email}`} className="mt-1 block break-all text-sm text-slate-600">{b.email}</a> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
