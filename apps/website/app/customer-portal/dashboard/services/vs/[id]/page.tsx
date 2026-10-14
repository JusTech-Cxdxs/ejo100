import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { requireCustomer } from '@/lib/customer-portal/session';
import { customerEstimateLines, serviceEstimateSelect, serviceItem, serviceItemSelect } from '@/lib/customer-portal/data';
import { ServiceDetail } from '@/components/customer/ServiceDetail';

export const metadata = { title: 'Vehicle service' };

const branchSelect = { name: true, address: true, hotlines: true, email: true, bankName: true, bankAccountName: true, bankAccountNumber: true } as const;

/**
 * One Vehicle Service. Found by id AND the signed-in customer's id. The
 * estimate shows only once the customer has been notified of it. No
 * technician notes, costs or staff names.
 */
export default async function VehicleServicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCustomer();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const vs = await prisma.vehicleService.findFirst({
    where: { id, customerId: me.id },
    select: {
      ...serviceItemSelect,
      customerComplaint: true,
      odometerAtService: true,
      complaints: { orderBy: { sequenceNumber: 'asc' }, select: { description: true } },
      branch: { select: branchSelect },
      serviceEstimate: { select: serviceEstimateSelect },
      warranties: { where: { customerId: me.id }, select: { id: true, warrantyNumber: true, subjectDescription: true, endsAt: true, status: true } },
    },
  });
  if (!vs) notFound();
  const item = serviceItem(vs);
  return (
    <ServiceDetail
      item={item}
      complaints={vs.complaints.length ? vs.complaints.map((c) => c.description) : vs.customerComplaint ? [vs.customerComplaint] : []}
      lines={customerEstimateLines(vs.serviceEstimate)}
      branch={vs.branch ? { name: vs.branch.name, address: vs.branch.address, hotlines: vs.branch.hotlines, email: vs.branch.email, bank: { bankName: vs.branch.bankName, accountName: vs.branch.bankAccountName, accountNumber: vs.branch.bankAccountNumber } } : null}
      mileage={vs.odometerAtService}
      warranties={vs.warranties.map((w) => ({ id: w.id, number: w.warrantyNumber, subject: w.subjectDescription, endsAt: w.endsAt, status: String(w.status) }))}
    />
  );
}
