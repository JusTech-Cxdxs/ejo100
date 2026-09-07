type CompanyInfo = {
  name: string;
  legalName: string | null;
  website: string | null;
  hotlines: string[];
  hqAddress: string | null;
  poBox: string | null;
  rcNumber: string | null;
};

/**
 * The one real, shared masthead every printable document in the
 * system starts with — a genuine letterhead, not a screenshot of the
 * dashboard. Deliberately quiet: the company's own accent color marks
 * only the document title and the one rule beneath the header, never
 * a full-width colored band, since this needs to read cleanly even on
 * a black-and-white office printer.
 */
export function DocumentHeader({
  company,
  logoUrl,
  documentTitle,
  referenceNumber,
  statusLabel,
  accentColor,
}: {
  company: CompanyInfo;
  logoUrl: string;
  documentTitle: string;
  referenceNumber: string;
  statusLabel?: string;
  accentColor: string;
}) {
  const hotlinesLine = company.hotlines.length > 0 ? `${company.hotlines.length === 1 ? 'Hotline' : 'Hotlines'}: ${company.hotlines.join(', ')}` : null;
  const contactLine = [hotlinesLine, company.website].filter(Boolean).join('   ·   ');
  const registrationLine = [company.poBox, company.rcNumber].filter(Boolean).join('   ·   ');

  return (
    <div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', width: '56px', paddingRight: '16px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={company.name} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
            </td>
            <td style={{ verticalAlign: 'top' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>{company.legalName ?? company.name}</div>
              {company.hqAddress ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{company.hqAddress}</div> : null}
              {contactLine ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>{contactLine}</div> : null}
              {registrationLine ? <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{registrationLine}</div> : null}
            </td>
            <td style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: accentColor }}>{documentTitle}</div>
              <div style={{ fontSize: '13px', color: '#0F172A', marginTop: '2px' }}>{referenceNumber}</div>
              {statusLabel ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{statusLabel}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ borderTop: `2px solid ${accentColor}`, marginTop: '12px' }} />
    </div>
  );
}

/**
 * Two real signature lines — the person who issued the document, and
 * the person who's collecting whatever it represents. A blank line
 * plus their own real name printed underneath, so both sides have a
 * clear place to actually sign in pen, and it's obvious who's
 * expected to sign where.
 */
export function SignatureBlock({ issuerLabel, issuerName, collectorLabel, collectorName }: { issuerLabel: string; issuerName: string | null; collectorLabel: string; collectorName: string | null }) {
  return (
    <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '48px' }}>
      <tbody>
        <tr>
          <td style={{ width: '48%', verticalAlign: 'top' }}>
            <div style={{ borderTop: '1px solid #0F172A', paddingTop: '6px' }}>
              <div style={{ fontSize: '11px', color: '#475569' }}>{issuerLabel}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>{issuerName ?? ''}</div>
            </div>
          </td>
          <td style={{ width: '4%' }} />
          <td style={{ width: '48%', verticalAlign: 'top' }}>
            <div style={{ borderTop: '1px solid #0F172A', paddingTop: '6px' }}>
              <div style={{ fontSize: '11px', color: '#475569' }}>{collectorLabel}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>{collectorName ?? ''}</div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** The real, quiet footer on every printed document — the same
 * company identity, one more time, so a physically loose page still
 * traces back to where it came from. */
export function DocumentFooter({ company }: { company: CompanyInfo }) {
  return (
    <div style={{ marginTop: '32px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>
      {company.legalName ?? company.name}
      {company.hqAddress ? ` · ${company.hqAddress}` : ''}
    </div>
  );
}
