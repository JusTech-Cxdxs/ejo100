type OrganisationInfo = {
  name: string;
  legalName: string | null;
  website: string | null;
  hotlines: string[];
  hqAddress: string | null;
  poBox: string | null;
  rcNumber: string | null;
};

type BranchInfo = {
  name: string;
  address: string | null;
  hotlines: string[];
};

function hotlinesText(hotlines: string[]): string | null {
  return hotlines.length > 0 ? hotlines.join('  |  ') : null;
}

/**
 * The one real, shared masthead every printable document in the
 * system starts with — a genuine letterhead, not a screenshot of the
 * dashboard. Two real tiers, confirmed directly from a real printed
 * Kewalram Job Card: the Organisation's own legal identity (name,
 * legal entity, HQ address, RC number, general hotlines) is the
 * masthead itself; the specific executing Branch — its own real
 * address and its own real hotlines, genuinely different from the
 * Organisation's general ones — follows as its own block underneath.
 * Deliberately quiet: the organisation's own accent color marks only
 * the document title and the section rules, never a full-width
 * colored band, since this needs to read cleanly even on a
 * black-and-white office printer.
 */
export function DocumentHeader({
  organisation,
  branch,
  divisionName,
  logoUrl,
  documentTitle,
  referenceNumber,
  statusLabel,
  accentColor,
}: {
  organisation: OrganisationInfo;
  branch: BranchInfo;
  divisionName?: string;
  logoUrl: string;
  documentTitle: string;
  referenceNumber: string;
  statusLabel?: string;
  accentColor: string;
}) {
  const orgHotlinesText = hotlinesText(organisation.hotlines);
  const branchHotlinesText = hotlinesText(branch.hotlines);
  const registrationLine = [organisation.poBox, organisation.rcNumber ? `RC Number: ${organisation.rcNumber}` : null].filter(Boolean).join('   ·   ');

  return (
    <div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', width: '56px', paddingRight: '16px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={organisation.name} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
            </td>
            <td style={{ verticalAlign: 'top' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>{organisation.name}</div>
            </td>
            <td style={{ verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: accentColor }}>{documentTitle}</div>
              {divisionName ? <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginTop: '1px' }}>{divisionName}</div> : null}
              <div style={{ fontSize: '13px', color: '#0F172A', marginTop: '2px' }}>{referenceNumber}</div>
              {statusLabel ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{statusLabel}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ borderTop: `2px solid ${accentColor}`, marginTop: '10px', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.03em' }}>
          {organisation.legalName ? 'LEGAL OPERATIONAL LEDGER / CORPORATE HQ' : null}
        </div>
        {organisation.legalName ? <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>{organisation.legalName}</div> : null}
        {organisation.hqAddress ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>{organisation.hqAddress}</div> : null}
        {registrationLine ? <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{registrationLine}</div> : null}
        {orgHotlinesText ? (
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
            General Hotlines: {orgHotlinesText}
            {organisation.website ? `   ·   ${organisation.website}` : ''}
          </div>
        ) : null}
      </div>
      <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '10px', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.03em' }}>EXECUTING FACILITY / BRANCH</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>{branch.name}</div>
        {branch.address ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>{branch.address}</div> : null}
        {branchHotlinesText ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>Facility Hotlines: {branchHotlinesText}</div> : null}
      </div>
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
 * organisation identity, one more time, so a physically loose page still
 * traces back to where it came from. */
export function DocumentFooter({ organisation }: { organisation: OrganisationInfo }) {
  return (
    <div style={{ marginTop: '32px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>
      {organisation.legalName ?? organisation.name}
      {organisation.hqAddress ? ` · ${organisation.hqAddress}` : ''}
    </div>
  );
}
