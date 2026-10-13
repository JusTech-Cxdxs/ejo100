import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireCustomer } from '@/lib/customer-portal/session';
import { jobCardItem, jobCardItemSelect } from '@/lib/customer-portal/data';
import { num } from '@/lib/customer-portal/format';
import { ServiceDetail } from '@/components/customer/ServiceDetail';

export const metadata = { title: 'Job Card' };

const branchSelect = { name: true, address: true, hotlines: true, email: true, bankName: true, bankAccountName: true, bankAccountNumber: true } as const;

/**
 * One Job Card. Found by id AND the signed-in customer's id — someone
 * else's Job Card is "not found". The estimate shows only once the
 * customer has been notified of it, and only the lines billed to the
 * customer. No internal notes, diagnosis, costs or staff names.
 */
export default async function JobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCustomer();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const jc = await prisma.jobCard.findFirst({
    where: { id, customerId: me.id },
    select: {
      ...jobCardItemSelect,
      complaint: true,
      mileageAtCheckIn: true,
      complaints: { orderBy: { sequenceNumber: 'asc' }, select: { description: true } },
      branch: { select: branchSelect },
      estimate: {
        select: {
          customerNotifiedAt: true,
          lineItems: { where: { billTo: 'CUSTOMER' }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, description: true, quantity: true, unitPrice: true, amount: true, unitOfMeasure: true } },
        },
      },
      warranties: { where: { customerId: me.id }, select: { id: true, warrantyNumber: true, subjectDescription: true, endsAt: true, status: true } },
    },
  });
  if (!jc) notFound();
  const item = jobCardItem(jc);
  const notified = Boolean(jc.estimate?.customerNotifiedAt);
  return (
    <ServiceDetail
      item={item}
      complaints={jc.complaints.length ? jc.complaints.map((c) => c.description) : jc.complaint ? [jc.complaint] : []}
      lines={notified && jc.estimate ? jc.estimate.lineItems.map((l) => ({ id: l.id, type: String(l.type), description: l.description, quantity: l.quantity, unitPrice: l.unitPrice === null ? null : num(l.unitPrice), amount: l.amount === null ? null : num(l.amount), unit: l.unitOfMeasure })) : null}
      branch={jc.branch ? { name: jc.branch.name, address: jc.branch.address, hotlines: jc.branch.hotlines, email: jc.branch.email, bank: { bankName: jc.branch.bankName, accountName: jc.branch.bankAccountName, accountNumber: jc.branch.bankAccountNumber } } : null}
      mileage={jc.mileageAtCheckIn}
      warranties={jc.warranties.map((w) => ({ id: w.id, number: w.warrantyNumber, subject: w.subjectDescription, endsAt: w.endsAt, status: String(w.status) }))}
    />
  );
}
