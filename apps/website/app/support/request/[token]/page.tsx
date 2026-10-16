import type { Metadata } from 'next';
import { prisma } from '@ejo/database';
import { SupportResponse } from '@/components/SupportResponse';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your request', robots: { index: false, follow: false } };

const STATUS: Record<string, { label: string; text: string }> = {
  OPEN: { label: 'With our team', text: 'A colleague is looking at your request.' },
  ON_HOLD: { label: 'With our team', text: 'We are waiting on someone else (for example the manufacturer or a supplier) and will update you.' },
  WAITING_ON_CUSTOMER: { label: 'Waiting for you', text: 'We have answered. Tell us below whether that solved it.' },
  RESOLVED: { label: 'Resolved', text: 'This request is marked as solved.' },
  CLOSED: { label: 'Closed', text: 'This request is closed. Writing to us again opens a new one.' },
};

/**
 * A customer's own page for one support request (the link in our emails):
 * its reference and status, and "Yes, this is solved" / "I still need a
 * person" / "How did we do?". Only the reference, the subject and the status
 * are shown — never messages or anyone's names. Nothing changes on opening.
 */
export default async function SupportRequestPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ a?: string; rate?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const t = /^[A-Za-z0-9_-]{24,64}$/.test(token)
    ? await prisma.supportTicket.findUnique({ where: { token }, select: { number: true, subject: true, status: true, csatScore: true, organisationId: true } })
    : null;
  const org = t ? await prisma.organisation.findUnique({ where: { id: t.organisationId }, select: { name: true } }) : null;
  const rate = Number(sp.rate);
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
      {t ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ejo-primary-dark)]">{org?.name ?? 'Customer support'} · {t.number}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{t.subject}</h1>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{STATUS[t.status]?.label ?? t.status}</p>
          <p className="mt-3 text-sm text-slate-600">{STATUS[t.status]?.text}</p>
          <div className="mt-8">
            <SupportResponse token={token} resolved={t.status === 'RESOLVED' || t.status === 'CLOSED'} closed={t.status === 'CLOSED'} preset={{ a: sp.a, rate: Number.isInteger(rate) && rate >= 1 && rate <= 5 ? rate : undefined }} rated={t.csatScore} />
          </div>
          <p className="mt-8 text-xs text-slate-500">To add anything, reply to our email and keep the reference {t.number} in the subject.</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">We could not find this request</h1>
          <p className="mt-2 text-sm text-slate-600">The link may be incomplete. Please reply to our email instead, and keep the reference in the subject.</p>
        </div>
      )}
    </main>
  );
}
