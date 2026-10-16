import { PLATFORM } from '@/lib/brand';
type OrganisationInfo = {
  name: string;
  legalName: string | null;
  website: string | null;
  email: string | null;
  hotlines: string[];
  hqAddress: string | null;
  poBox: string | null;
  rcNumber: string | null;
};

type BranchInfo = {
  name: string;
  address: string | null;
  email: string | null;
  hotlines: string[];
};

function hotlinesText(hotlines: string[]): string | null {
  return hotlines.length > 0 ? hotlines.join('  |  ') : null;
}

/**
 * The shared letterhead every printable document starts with. Two tiers,
 * as on the organisation's printed Job Card: the Organisation's legal
 * identity (name, legal entity, HQ address, RC number, general hotlines)
 * is the masthead; the executing Branch, with its own address and
 * hotlines, follows underneath. Everything comes from the database.
 *
 * The wordmark splits the organisation's name on its first word (bold,
 * large) from the rest (smaller, set off by a thin accent rule). Quiet
 * everywhere else: the accent color marks only the wordmark rule,
 * the document title, and the section rules, never a full-width
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
  const registrationLine = [organisation.poBox ? `P.O. Box ${organisation.poBox}` : null, organisation.rcNumber ? `RC Number: ${organisation.rcNumber}` : null].filter(Boolean).join('   ·   ');
  const nameWords = organisation.name.trim().split(/\s+/);
  const wordmarkTop = nameWords[0] ?? organisation.name;
  const wordmarkBottom = nameWords.slice(1).join(' ');

  return (
    <div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'middle', padding: 0 }}>
              {/* Flex, not table cells, so the 4px gap beside the logo
                  matches the 4px gap between the two wordmark lines. */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Fixed width and height (the logo's aspect ratio): some PDF engines
                    squash an image with width:auto. Height equals the wordmark's. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={organisation.name} style={{ width: '39px', height: '47px', display: 'block', marginRight: '4px' }} />
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{wordmarkTop}</div>
                  {wordmarkBottom ? (
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                      {/* A border, not a background: backgrounds don't print by default.
                          flex:1 makes it end flush with the line above. */}
                      <div style={{ flex: 1, borderBottom: `1.25px solid ${accentColor}`, marginRight: '6px' }} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{wordmarkBottom}</span>
                    </div>
                  ) : null}
                </div>
              </div>
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
      <div style={{ borderTop: `2px solid ${accentColor}`, marginTop: '12px', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.03em' }}>
          {organisation.legalName ? 'LEGAL OPERATIONAL LEDGER / CORPORATE HQ' : null}
        </div>
        {organisation.legalName ? <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>{organisation.legalName}</div> : null}
        {organisation.hqAddress ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>{organisation.hqAddress}</div> : null}
        {registrationLine ? <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '1px' }}>{registrationLine}</div> : null}
        {orgHotlinesText ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>General Hotlines: {orgHotlinesText}</div> : null}
        {organisation.website ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>Website: {organisation.website}</div> : null}
        {organisation.email ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>Email: {organisation.email}</div> : null}
      </div>
      <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '10px', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.03em' }}>EXECUTING FACILITY / BRANCH</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>{branch.name}</div>
        {branch.address ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>{branch.address}</div> : null}
        {branchHotlinesText ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>Facility Hotlines: {branchHotlinesText}</div> : null}
        {branch.email ? <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>Email: {branch.email}</div> : null}
      </div>
    </div>
  );
}

/** Two signature lines (issued by, collected by), each with the name printed underneath. */
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

/** Footer on every printed document: the organisation's details again (so a
 * loose page can be traced) and a small platform credit. */
export function DocumentFooter({ organisation }: { organisation: OrganisationInfo }) {
  return (
    <div style={{ marginTop: '32px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
      <div style={{ fontSize: '10px', color: '#94A3B8' }}>
        {organisation.legalName ?? organisation.name}
        {organisation.hqAddress ? ` · ${organisation.hqAddress}` : ''}
      </div>
      <div style={{ fontSize: '8px', color: '#CBD5E1', marginTop: '4px' }}>{PLATFORM.poweredBy}</div>
    </div>
  );
}
