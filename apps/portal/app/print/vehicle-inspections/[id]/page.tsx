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

/**
 * A real, standalone printable document — outside the app's own
 * dashboard layout entirely, same as every other print route in this
 * project. Deliberately renders straight from the live database on
 * every real request rather than any cached or pre-generated
 * snapshot, so if an inspection item is edited, added, or the
 * inspection itself is cancelled and redone, the very next print
 * reflects exactly that — never a stale copy of what things looked
 * like at some earlier moment.
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
  // Nothing genuinely real to print until an inspection actually
  // exists — either a real checklist or a real, recorded skip.
  if (!inspection) notFound();

  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  const logoUrl = `${portalUrl}/images/logo/logo.png`;
  const vehicleSummary = [service.vehicle.year, service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || '—';
  const statusLabel = inspection.status === 'COMPLETED' ? 'Completed' : inspection.status === 'SKIPPED' ? 'Skipped' : 'In Progress';

  const itemsBySection = new Map<string, typeof inspection.items>();
  for (const item of inspection.items) {
    const list = itemsBySection.get(item.section) ?? [];
    list.push(item);
    itemsBySection.set(item.section, list);
  }

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
        <Field label="SUPERVISOR IN CHARGE" value={service.supervisor?.fullName ?? 'Not yet assigned'} />
        <Field label="INSPECTED BY" value={inspection.inspectedBy.fullName} />
        <Field
          label="TECHNICIAN IN CHARGE"
          value={service.assignedTechnician?.fullName ?? 'Not yet assigned'}
        />
        <Field
          label={inspection.status === 'SKIPPED' ? 'SKIPPED ON' : inspection.status === 'COMPLETED' ? 'COMPLETED ON' : 'STARTED ON'}
          value={
            inspection.status === 'SKIPPED' && inspection.skippedAt
              ? formatDateTime(inspection.skippedAt)
              : inspection.status === 'COMPLETED' && inspection.completedAt
                ? formatDateTime(inspection.completedAt)
                : formatDateTime(new Date())
          }
        />
      </div>

      {inspection.status === 'SKIPPED' ? (
        <div style={{ marginTop: '24px', padding: '16px', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Inspection Skipped</div>
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
            {inspection.skipReason ? `Reason: ${inspection.skipReason}` : 'No reason recorded.'}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '24px' }}>
          {[...itemsBySection.entries()].map(([section, items]) => (
            <div key={section} style={{ marginTop: '16px', breakInside: 'avoid' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {section}
              </div>
              <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'left' }}>
                    <th style={{ padding: '5px 4px' }}>Item</th>
                    <th style={{ padding: '5px 4px' }}>Condition</th>
                    <th style={{ padding: '5px 4px' }}>Severity</th>
                    <th style={{ padding: '5px 4px' }}>Action</th>
                    {isOrgCopy ? <th style={{ padding: '5px 4px' }}>Notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: { id: string; name: string; condition: string | null; severity: string | null; action: string | null; notes: string | null }) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '5px 4px', fontWeight: 600 }}>{item.name}</td>
                      <td style={{ padding: '5px 4px' }}>{item.condition ?? '—'}</td>
                      <td style={{ padding: '5px 4px', fontWeight: 600, color: item.severity ? SEVERITY_COLOR[item.severity] : '#94A3B8' }}>
                        {item.severity ? SEVERITY_LABEL[item.severity] : 'Not Reviewed'}
                      </td>
                      <td style={{ padding: '5px 4px' }}>{item.action ?? '—'}</td>
                      {isOrgCopy ? <td style={{ padding: '5px 4px' }}>{item.notes ?? '—'}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {inspection.notes ? (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>OVERALL NOTES</div>
              <div style={{ fontSize: '12px', color: '#0F172A', marginTop: '2px' }}>{inspection.notes}</div>
            </div>
          ) : null}
        </div>
      )}

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
