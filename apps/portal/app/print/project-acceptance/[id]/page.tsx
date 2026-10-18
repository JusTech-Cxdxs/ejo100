import { portalBaseUrl } from '@/lib/portal-url';
import { notFound } from 'next/navigation';
import { prisma } from '@ejo/database';
import { getProject } from '@/lib/actions/projects';
import { getOrganisation } from '@/lib/actions/organisation';
import { DocumentHeader, SignatureBlock, DocumentFooter } from '@/components/print/DocumentHeader';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PROJECT_STATUS_LABEL, PROJECT_KIND_LABEL, type ProjectStatus, type ProjectKind } from '@/lib/projects-core';
import { formatDateOnly } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '1px' }}>{value}</div>
    </div>
  );
}

/**
 * The acceptance certificate: what was contracted, what was delivered per
 * site and when the customer accepted it. Customer Copy (?variant=client)
 * leaves out the linked internal records; the Organisation Copy lists them.
 */
export default async function PrintProjectAcceptancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrgCopy = variant !== 'client';
  const [p, organisation] = await Promise.all([getProject(id), getOrganisation()]);
  if (!p || !organisation) notFound();
  const branch = await prisma.branch.findFirst({ where: { businessUnit: { organisationId: p.organisationId } }, orderBy: { createdAt: 'asc' } });
  if (!branch) notFound();
  const cell = { padding: '3px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px' } as const;
  const customerName = p.customer.customerCompany?.companyName ?? p.customer.fullName;
  const acceptedOn = p.deliverables.map((d) => d.acceptedAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A' }}>
      <PrintOnLoad />
      <DocumentHeader
        organisation={organisation}
        branch={branch}
        divisionName="Projects"
        logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
        documentTitle={isOrgCopy ? 'Acceptance Certificate — Organisation Copy' : 'Acceptance Certificate'}
        referenceNumber={p.number}
        statusLabel={PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status}
        accentColor="#E10600"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 18px', marginTop: '16px' }}>
        <Field label="PROJECT" value={p.name} />
        <Field label="CUSTOMER" value={customerName} />
        <Field label="KIND" value={PROJECT_KIND_LABEL[p.kind as ProjectKind]} />
        <Field label="TENDER / CONTRACT REF" value={p.tenderReference ?? '—'} />
        <Field label="CONTRACT VALUE" value={formatCurrency(p.contractValue, p.currency)} />
        <Field label="PERIOD" value={`${p.startDate ? formatDateOnly(p.startDate) : '—'} – ${p.endDate ? formatDateOnly(p.endDate) : '—'}`} />
        <Field label="PROJECT MANAGER" value={p.manager.fullName} />
        <Field label="DELIVERED" value={`${p.progress.delivered} of ${p.progress.ordered} units (${p.progress.percent}%)`} />
        <Field label="ACCEPTED ON" value={acceptedOn ? formatDateOnly(acceptedOn) : 'Pending'} />
      </div>

      <p style={{ marginTop: '14px', fontSize: '12px', lineHeight: 1.5 }}>
        This certifies that {organisation.legalName ?? organisation.name} has delivered to {customerName} the goods listed below under {p.tenderReference ? `contract ${p.tenderReference}` : `project ${p.number}`}, and that the customer has inspected and accepted them.
      </p>

      <div style={{ marginTop: '12px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>DELIVERABLES</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <thead><tr><th style={{ ...cell, textAlign: 'left' }}>Product</th><th style={{ ...cell, textAlign: 'left' }}>Site</th><th style={{ ...cell, textAlign: 'right' }}>Contracted</th><th style={{ ...cell, textAlign: 'right' }}>Delivered</th><th style={{ ...cell, textAlign: 'left' }}>Accepted</th></tr></thead>
        <tbody>
          {p.deliverables.length === 0 ? <tr><td style={cell} colSpan={5}>No deliverables recorded.</td></tr> : p.deliverables.map((d) => (
            <tr key={d.id}><td style={cell}>{d.product.name}{d.configuration ? ` — ${d.configuration.name}` : ''}</td><td style={cell}>{d.siteName ?? '—'}</td><td style={{ ...cell, textAlign: 'right' }}>{d.quantity}</td><td style={{ ...cell, textAlign: 'right' }}>{d.deliveredQuantity}</td><td style={cell}>{d.acceptedAt ? formatDateOnly(d.acceptedAt) : 'Pending'}</td></tr>
          ))}
        </tbody>
      </table>

      {p.milestones.length ? (
        <>
          <div style={{ marginTop: '12px', fontSize: '11px', fontWeight: 700, color: '#475569' }}>MILESTONES</div>
          <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
            <tbody>{p.milestones.map((m) => <tr key={m.id}><td style={cell}>{m.name}</td><td style={cell}>{m.dueDate ? `due ${formatDateOnly(m.dueDate)}` : ''}</td><td style={{ ...cell, textAlign: 'right' }}>{m.completedAt ? `done ${formatDateOnly(m.completedAt)}` : 'open'}</td></tr>)}</tbody>
          </table>
        </>
      ) : null}

      {isOrgCopy ? (
        <div style={{ marginTop: '14px', fontSize: '11px', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>LINKED RECORDS</div>
          <div>Sales orders: {p.salesOrders.map((o) => o.number).join(', ') || 'none'}</div>
          <div>Quotations: {p.quotations.map((q) => q.number).join(', ') || 'none'}</div>
          <div>Build orders: {p.buildOrders.map((b) => b.number).join(', ') || 'none'}</div>
        </div>
      ) : null}

      <SignatureBlock issuerLabel={`For ${organisation.name}`} issuerName={p.manager.fullName} collectorLabel={`For ${customerName}`} collectorName={p.customer.fullName} />
      <DocumentFooter organisation={organisation} />
    </div>
  );
}
