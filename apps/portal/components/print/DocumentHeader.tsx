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
 * The one real, shared masthead every printable document in the
 * system starts with — a genuine letterhead, not a screenshot of the
 * dashboard. Two real tiers, confirmed directly from a real printed
 * Kewalram Job Card: the Organisation's own legal identity (name,
 * legal entity, HQ address, RC number, general hotlines) is the
 * masthead itself; the specific executing Branch — its own real
 * address and its own real hotlines, genuinely different from the
 * Organisation's general ones — follows as its own block underneath.
 *
 * The wordmark splits the organisation's name on its first word (bold,
 * large) from the rest (smaller, set off by a thin accent rule above
 * it) — matching the real Kewalram lockup: KEWALRAM bold on top,
 * Chanrai Group smaller beneath a green rule. Deliberately quiet
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
            <td style={{ verticalAlign: 'middle', width: '104px', padding: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={organisation.name} style={{ width: '104px', height: '104px', objectFit: 'contain', display: 'block' }} />
            </td>
            <td style={{ verticalAlign: 'middle' }}>
              {/* Real logo-lockup technique, not an approximation: an
                  inline-flex column with align-items:stretch sizes
                  itself to its widest child (the wordmark), then
                  forces every other child to that same width. The row
                  below is itself a flex row with the green rule set to
                  flex:1 — it automatically grows to fill exactly the
                  leftover space, which is what pushes "Chanrai Group"
                  to end flush with "Kewalram" above it, on any name,
                  at any size, without hand-tuned pixel widths.
                  The rule itself is a real border, not a background
                  color — browsers suppress background-color by
                  default when printing unless the person manually
                  enables "Background graphics" in their print dialog,
                  which is off by default. Borders always print
                  regardless of that setting, so this is the only
                  reliable way to guarantee the line actually shows up
                  on a real printed page, not just on screen. */}
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{wordmarkTop}</div>
                {wordmarkBottom ? (
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '1px' }}>
                    <div style={{ flex: 1, borderBottom: `2.5px solid ${accentColor}`, marginRight: '6px' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{wordmarkBottom}</span>
                  </div>
                ) : null}
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

/** The real, quiet footer on every printed document — the organisation
 * identity once more (so a physically loose page still traces back to
 * where it came from), plus a small, faint platform credit at the very
 * bottom — deliberately the smallest, quietest text on the page. */
export function DocumentFooter({ organisation }: { organisation: OrganisationInfo }) {
  return (
    <div style={{ marginTop: '32px', paddingTop: '8px', borderTop: '1px solid #E2E8F0', textAlign: 'center' }}>
      <div style={{ fontSize: '10px', color: '#94A3B8' }}>
        {organisation.legalName ?? organisation.name}
        {organisation.hqAddress ? ` · ${organisation.hqAddress}` : ''}
      </div>
      <div style={{ fontSize: '8px', color: '#CBD5E1', marginTop: '4px' }}>Powered by EJO 100 Enterprise Platform</div>
    </div>
  );
}
