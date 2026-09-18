import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 32, paddingHorizontal: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#0F172A' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 44, height: 53 },
  wordmarkWrap: { marginLeft: 8 },
  wordmarkTop: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  wordmarkBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  wordmarkRule: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#16A34A', marginRight: 5 },
  wordmarkBottom: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#334155' },
  docTitleWrap: { marginLeft: 'auto', alignItems: 'flex-end' },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#16A34A' },
  docRef: { fontSize: 11, marginTop: 2 },
  ruleThick: { borderBottomWidth: 1.5, borderBottomColor: '#16A34A', marginTop: 12, paddingTop: 8 },
  eyebrow: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#94A3B8', letterSpacing: 0.5 },
  legalName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  smallMuted: { fontSize: 9, color: '#475569', marginTop: 1 },
  ruleThin: { borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', marginTop: 10, paddingTop: 8 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  field: { width: '50%', marginBottom: 10 },
  fieldLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#94A3B8', letterSpacing: 0.5 },
  fieldValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  zone: { marginTop: 16, backgroundColor: '#F0FDF4', borderWidth: 0.5, borderColor: '#BBF7D0', borderRadius: 6, padding: 12 },
  zoneTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#475569', marginTop: 10, marginBottom: 3, letterSpacing: 0.3 },
  tHeadRow: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#0F172A', paddingBottom: 4 },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', paddingVertical: 4 },
  colItem: { width: '30%' },
  colCondition: { width: '25%' },
  colSeverity: { width: '20%' },
  colAction: { width: '25%' },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#475569' },
  td: { fontSize: 8.5 },
  tdItem: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  emptyBox: { marginTop: 16, backgroundColor: '#F8FAFC', borderWidth: 0.5, borderColor: '#E2E8F0', borderRadius: 6, padding: 12 },
  emptyText: { fontSize: 9, color: '#475569' },
  footer: { marginTop: 28, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94A3B8' },
});

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

export type InspectionPdfItem = {
  section: string;
  name: string;
  condition: string | null;
  severity: string | null;
  action: string | null;
};

export type InspectionPdfProps = {
  organisation: {
    name: string;
    legalName: string | null;
    hqAddress: string | null;
    poBox: string | null;
    rcNumber: string | null;
    hotlines: string[];
    website: string | null;
    email: string | null;
  };
  branch: {
    name: string;
    address: string | null;
    hotlines: string[];
    email: string | null;
  };
  logoUrl: string;
  serviceNumber: string;
  customerName: string;
  vehicleDescription: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  inspectedByName: string;
  completedOnLabel: string;
  /** Reviewed items only — the customer's own copy never lists what
   * wasn't looked at, matching exactly the real client-copy rule the
   * print page already applies. */
  reviewedItems: InspectionPdfItem[];
};

/**
 * The customer's own real, styled inspection report — attached
 * alongside the estimate PDF on the same approval email, never a
 * separate document to track. Deliberately the client-copy content
 * only (reviewed items, no internal notes column) — same real rule
 * print/vehicle-inspections/[id]/page.tsx already applies for a
 * customer viewing that same report on screen.
 */
export function InspectionPdf(props: InspectionPdfProps) {
  const { organisation, branch, logoUrl, serviceNumber, customerName, vehicleDescription, plateNumber, chassisNumber, inspectedByName, completedOnLabel, reviewedItems } = props;

  const nameWords = organisation.name.trim().split(/\s+/);
  const wordmarkTop = nameWords[0] ?? organisation.name;
  const wordmarkBottom = nameWords.slice(1).join(' ');
  const registrationLine = [organisation.poBox ? `P.O. Box ${organisation.poBox}` : null, organisation.rcNumber ? `RC Number: ${organisation.rcNumber}` : null].filter(Boolean).join('   ·   ');

  const bySection = new Map<string, InspectionPdfItem[]>();
  for (const item of reviewedItems) {
    const list = bySection.get(item.section) ?? [];
    list.push(item);
    bySection.set(item.section, list);
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoUrl} style={styles.logo} />
          <View style={styles.wordmarkWrap}>
            <Text style={styles.wordmarkTop}>{wordmarkTop}</Text>
            {wordmarkBottom ? (
              <View style={styles.wordmarkBottomRow}>
                <View style={styles.wordmarkRule} />
                <Text style={styles.wordmarkBottom}>{wordmarkBottom}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.docTitleWrap}>
            <Text style={styles.docTitle}>Vehicle Inspection Report</Text>
            <Text style={styles.docRef}>{serviceNumber}</Text>
          </View>
        </View>

        <View style={styles.ruleThick}>
          {organisation.legalName ? (
            <>
              <Text style={styles.eyebrow}>LEGAL OPERATIONAL LEDGER / CORPORATE HQ</Text>
              <Text style={styles.legalName}>{organisation.legalName}</Text>
            </>
          ) : null}
          {organisation.hqAddress ? <Text style={styles.smallMuted}>{organisation.hqAddress}</Text> : null}
          {registrationLine ? <Text style={styles.smallMuted}>{registrationLine}</Text> : null}
          {organisation.hotlines.length > 0 ? <Text style={styles.smallMuted}>General Hotlines: {organisation.hotlines.join('  |  ')}</Text> : null}
          {organisation.website ? <Text style={styles.smallMuted}>Website: {organisation.website}</Text> : null}
          {organisation.email ? <Text style={styles.smallMuted}>Email: {organisation.email}</Text> : null}
        </View>

        <View style={styles.ruleThin}>
          <Text style={styles.eyebrow}>EXECUTING FACILITY / BRANCH</Text>
          <Text style={styles.legalName}>{branch.name}</Text>
          {branch.address ? <Text style={styles.smallMuted}>{branch.address}</Text> : null}
          {branch.hotlines.length > 0 ? <Text style={styles.smallMuted}>Facility Hotlines: {branch.hotlines.join('  |  ')}</Text> : null}
          {branch.email ? <Text style={styles.smallMuted}>Email: {branch.email}</Text> : null}
        </View>

        <View style={styles.fieldGrid}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>VEHICLE SERVICE</Text>
            <Text style={styles.fieldValue}>{serviceNumber}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>CUSTOMER</Text>
            <Text style={styles.fieldValue}>{customerName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>VEHICLE</Text>
            <Text style={styles.fieldValue}>{vehicleDescription}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>PLATE NO.</Text>
            <Text style={styles.fieldValue}>{plateNumber ?? '—'}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>VIN / CHASSIS</Text>
            <Text style={styles.fieldValue}>{chassisNumber ?? '—'}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>INSPECTED BY</Text>
            <Text style={styles.fieldValue}>{inspectedByName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>COMPLETED ON</Text>
            <Text style={styles.fieldValue}>{completedOnLabel}</Text>
          </View>
        </View>

        {reviewedItems.length > 0 ? (
          <View style={styles.zone}>
            <Text style={styles.zoneTitle}>Reviewed</Text>
            {[...bySection.entries()].map(([section, items]) => (
              <View key={section} wrap={false}>
                <Text style={styles.sectionTitle}>{section.toUpperCase()}</Text>
                <View style={styles.tHeadRow}>
                  <Text style={[styles.th, styles.colItem]}>Item</Text>
                  <Text style={[styles.th, styles.colCondition]}>Condition</Text>
                  <Text style={[styles.th, styles.colSeverity]}>Severity</Text>
                  <Text style={[styles.th, styles.colAction]}>Action</Text>
                </View>
                {items.map((item, i) => (
                  <View key={i} style={styles.tRow}>
                    <Text style={[styles.tdItem, styles.colItem]}>{item.name}</Text>
                    <Text style={[styles.td, styles.colCondition]}>{item.condition ?? '—'}</Text>
                    <Text style={[styles.td, styles.colSeverity, { color: item.severity ? SEVERITY_COLOR[item.severity] : '#94A3B8', fontFamily: 'Helvetica-Bold' }]}>
                      {item.severity ? SEVERITY_LABEL[item.severity] : 'Not Reviewed'}
                    </Text>
                    <Text style={[styles.td, styles.colAction]}>{item.action ?? '—'}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No items had been reviewed on this inspection at the time this report was generated.</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>This is a system-generated document from {organisation.name}.</Text>
        </View>
      </Page>
    </Document>
  );
}
