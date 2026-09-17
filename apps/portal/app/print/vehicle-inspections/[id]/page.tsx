import { notFound } from 'next/navigation';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { formatDateTime } from '@/lib/utils/format-date';

const SEVERITY_LABEL: Record<string, string> = {
  GOOD: 'Good',
  ATTENTION: 'Attention',
  SERVICE_REQUIRED: 'Service Required',
  CRITICAL: 'Critical',
};
const SEVERITY_COLOR: Record<string, string> = {
  GOOD: '#16A34A',
  ATTENTION: '#CA8A04',
  SERVICE_REQUIRED: '#EA580C',
  CRITICAL: '#DC2626',
};

type InspectionItem = { id: string; section: string; name: string; condition: string | null; severity: string | null; action: string | null; notes: string | null };

/** One label-above-value pair — same real spacing convention every
 * other printable document in this project already uses. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/** One real zone — Reviewed or Not Reviewed — grouped by category
 * inside it, matching the exact same real structure the inspection
 * workspace itself uses on-screen, so a printed copy never looks
 * like a different, unrelated document from what staff actually see
 * while working. showNotes is only ever true for the organisation
 * copy. */
function ItemsZone({
  title,
  backgroundColor,
  borderColor,
  items,
  showNotes,
}: {
  title: string;
  backgroundColor: string;
  borderColor: string;
  items: InspectionItem[];
  showNotes: boolean;
}) {
  const bySection = new Map<string, InspectionItem[]>();
  for (const item of items) {
    const list = bySection.get(item.section) ?? [];
    list.push(item);
    bySection.set(item.section, list);
  }
  return (
    <div style={{ marginTop: '20px', padding: '14px 16px', border: `1px solid ${borderColor}`, borderRadius: '8px', backgroundColor, breakInside: 'avoid' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>{title}</div>
      {[...bySection.entries()].map(([section, sectionItems]) => (
        <div key={section} style={{ marginTop: '12px', breakInside: 'avoid' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#475569', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {section}
          </div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
                <th style={{ padding: '5px 4px' }}>Item</th>
                <th style={{ padding: '5px 4px' }}>Condition</th>
                <th style={{ padding: '5px 4px' }}>Severity</th>
                <th style={{ padding: '5px 4px' }}>Action</th>
                {showNotes ? <th style={{ padding: '5px 4px' }}>Notes</th> : null}
              </tr>
            </thead>
            <tbody>
              {sectionItems.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '5px 4px', fontWeight: 600 }}>{item.name}</td>
                  <td style={{ padding: '5px 4px' }}>{item.condition ?? '—'}</td>
                  <td style={{ padding: '5px 4px', fontWeight: 600, color: item.severity ? SEVERITY_COLOR[item.severity] : '#94A3B8' }}>
                    {item.severity ? SEVERITY_LABEL[item.severity] : 'Not Reviewed'}
                  </td>
                  <td style={{ padding: '5px 4px' }}>{item.action ?? '—'}</td>
                  {showNotes ? <td style={{ padding: '5px 4px' }}>{item.notes ?? '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/**
 * A real, standalone printable document — outside the app's own
 * dashboard layout entirely, same as every other print route in this
 * project. Renders straight from the live database on every real
 * request, never a cached or pre-generated snapshot, so an edited,
 * added, or removed inspection item shows up on the very next print.
 *
 * A skipped inspection has no real technical findings to hand
 * anyone — nothing to print, by design; the Vehicle Service page's
 * own audit trail already records that it was skipped, which is the
 * real, honest record for that case.
 */
export default async function PrintVehicleInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';

  const [service, inspection, organisation] = await Promise.all([
    getVehicleService(id),
    getVehicleInspection(id),
    getOrganisation(),
  ]);
  if (!service || !organisation) notFound();
  if (!inspection || inspection.status === 'SKIPPED') notFound();

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  const logoUrl = `${portalUrl}/images/logo/logo.png`;
  const vehicleSummary = [service.vehicle.year, service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || '—';
  const statusLabel = inspection.status === 'COMPLETED' ? 'Completed' : 'In Progress';

  const reviewedItems = inspection.items.filter((i: InspectionItem) => i.severity);
  const notReviewedItems = inspection.items.filter((i: InspectionItem) => !i.severity);

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={service.branch}
        logoUrl={logoUrl}
        documentTitle="Vehicle Inspection Report"
        referenceNumber={service.serviceNumber}
        statusLabel={statusLabel}
        accentColor="#16A34A"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginTop: '20px' }}>
        <Field label="CUSTOMER" value={service.customer.fullName} />
        {service.customer.address ? <Field label="CUSTOMER ADDRESS" value={service.customer.address} /> : null}
        <Field label="VEHICLE" value={vehicleSummary} />
        <Field label="PLATE NO." value={service.vehicle.plateNumber ?? '—'} />
        <Field label="VIN / CHASSIS" value={service.vehicle.chassisNumber ?? '—'} />
        <Field label="MILEAGE AT CHECK-IN" value={service.odometerAtService != null ? `${service.odometerAtService.toLocaleString('en-NG')} km` : '—'} />
        <Field label="DEPARTMENT" value={service.department?.name ?? '—'} />
        <Field label="SUPERVISOR IN CHARGE" value={service.supervisor?.fullName ?? 'Not yet assigned'} />
        <Field label="INSPECTED BY" value={inspection.inspectedBy.fullName} />
        <Field label="TECHNICIAN IN CHARGE" value={service.assignedTechnician?.fullName ?? 'Not yet assigned'} />
        <Field
          label={inspection.status === 'COMPLETED' ? 'COMPLETED ON' : 'STARTED ON'}
          value={inspection.status === 'COMPLETED' && inspection.completedAt ? formatDateTime(inspection.completedAt) : formatDateTime(new Date())}
        />
      </div>

      {reviewedItems.length > 0 ? (
        <ItemsZone title="✅ Reviewed" backgroundColor="#F0FDF4" borderColor="#BBF7D0" items={reviewedItems} showNotes={isOrgCopy} />
      ) : (
        <div style={{ marginTop: '20px', padding: '14px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC', fontSize: '12px', color: '#475569' }}>
          No items have been reviewed on this inspection yet.
        </div>
      )}

      {isOrgCopy && notReviewedItems.length > 0 ? (
        <ItemsZone title="⚪ Not Reviewed" backgroundColor="#FFFBEB" borderColor="#FDE68A" items={notReviewedItems} showNotes />
      ) : null}

      {inspection.notes ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>OVERALL NOTES</div>
          <div style={{ fontSize: '12px', color: '#0F172A', marginTop: '2px' }}>{inspection.notes}</div>
        </div>
      ) : null}

      <SignatureBlock
        issuerLabel="Inspected By"
        issuerName={inspection.inspectedBy.fullName}
        collectorLabel="Customer / Supervisor Acknowledgement"
        collectorName={null}
      />

      <DocumentFooter organisation={organisation} />
    </div>
  );
}
