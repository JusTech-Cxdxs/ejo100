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
  table: { marginTop: 16 },
  tHeadRow: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#0F172A', paddingBottom: 5 },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', paddingVertical: 5 },
  tFoot: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: '#0F172A', paddingTop: 6, marginTop: 2 },
  colSn: { width: '6%' },
  colDesc: { width: '54%' },
  colQty: { width: '18%', textAlign: 'right' },
  colAmt: { width: '22%', textAlign: 'right' },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#475569' },
  subtotalsBox: { marginTop: 10, alignItems: 'flex-end' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', width: 220, marginBottom: 2 },
  subtotalLabel: { fontSize: 9, color: '#475569' },
  subtotalValue: { fontSize: 9 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: 220, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  totalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  totalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  depositBox: { marginTop: 16, backgroundColor: '#FEF3C7', borderWidth: 0.5, borderColor: '#FDE68A', borderRadius: 6, padding: 12 },
  depositEyebrow: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#B45309', letterSpacing: 0.5 },
  depositAmount: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  depositNote: { fontSize: 8.5, color: '#78350F', marginTop: 4 },
  paymentTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6 },
  paymentBox: { backgroundColor: '#F8FAFC', borderWidth: 0.5, borderColor: '#E2E8F0', borderRadius: 6, padding: 12 },
  paymentLine: { fontSize: 9, marginBottom: 2 },
  footer: { marginTop: 28, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94A3B8' },
  footerCredit: { fontSize: 7, color: '#CBD5E1', marginTop: 3 },
});

export type EstimatePdfLineItem = {
  description: string;
  quantity: number;
  unitLabel: string | null;
  amount: string;
};

export type EstimatePdfProps = {
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
  jobNumber: string;
  customerName: string;
  customerAddress: string | null;
  vehicleDescription: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  lineItems: EstimatePdfLineItem[];
  servicesSubtotal: string | null;
  labourSubtotal: string | null;
  sundrySubtotal: string | null;
  totalAmount: string;
  minimumDepositAmount: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentRemarkSuggestion: string;
};

/**
 * The customer's own real, styled estimate document — attached to the
 * estimate-approved email as a real PDF, not just an HTML email body.
 * Deliberately NOT given a `type` field anywhere in its own props —
 * the internal Store Part / External Part / Labour / Sundry breakdown
 * never reaches this document at all, the same real "nothing to leak,
 * not just careful wording" reasoning already used for the estimate
 * email itself. Every quantity carries its own real unit, never a
 * bare number.
 */
export function EstimatePdf(props: EstimatePdfProps) {
  const {
    organisation, branch, logoUrl, jobNumber, customerName, customerAddress,
    vehicleDescription, plateNumber, chassisNumber, lineItems,
    servicesSubtotal, labourSubtotal, sundrySubtotal, totalAmount,
    minimumDepositAmount, bankName, accountName, accountNumber, paymentRemarkSuggestion,
  } = props;

  const nameWords = organisation.name.trim().split(/\s+/);
  const wordmarkTop = nameWords[0] ?? organisation.name;
  const wordmarkBottom = nameWords.slice(1).join(' ');
  const registrationLine = [organisation.poBox ? `P.O. Box ${organisation.poBox}` : null, organisation.rcNumber ? `RC Number: ${organisation.rcNumber}` : null].filter(Boolean).join('   ·   ');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* @react-pdf/renderer's own Image primitive, not an HTML
              <img> — it renders directly into the PDF's content
              stream and has no alt prop at all; the jsx-a11y rule
              can't tell the two apart since they share a name. */}
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
            <Text style={styles.docTitle}>Service Estimate</Text>
            <Text style={styles.docRef}>{jobNumber}</Text>
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
            <Text style={styles.fieldLabel}>JOB CARD</Text>
            <Text style={styles.fieldValue}>{jobNumber}</Text>
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
          {customerAddress ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>CUSTOMER ADDRESS</Text>
              <Text style={styles.fieldValue}>{customerAddress}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={[styles.th, styles.colSn]}>S/N</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Quantity</Text>
            <Text style={[styles.th, styles.colAmt]}>Amount</Text>
          </View>
          {lineItems.map((li, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <View style={styles.tRow} key={i}>
              <Text style={styles.colSn}>{i + 1}</Text>
              <Text style={styles.colDesc}>{li.description}</Text>
              <Text style={styles.colQty}>{li.quantity}{li.unitLabel ? ` ${li.unitLabel}` : ''}</Text>
              <Text style={styles.colAmt}>{li.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.subtotalsBox}>
          {servicesSubtotal ? (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Parts &amp; Services</Text>
              <Text style={styles.subtotalValue}>{servicesSubtotal}</Text>
            </View>
          ) : null}
          {labourSubtotal ? (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Labour</Text>
              <Text style={styles.subtotalValue}>{labourSubtotal}</Text>
            </View>
          ) : null}
          {sundrySubtotal ? (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Sundry</Text>
              <Text style={styles.subtotalValue}>{sundrySubtotal}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Estimate</Text>
            <Text style={styles.totalValue}>{totalAmount}</Text>
          </View>
        </View>

        <View style={styles.depositBox}>
          <Text style={styles.depositEyebrow}>MINIMUM DEPOSIT REQUIRED</Text>
          <Text style={styles.depositAmount}>{minimumDepositAmount}</Text>
          <Text style={styles.depositNote}>Work begins once this deposit is received and confirmed.</Text>
        </View>

        <Text style={styles.paymentTitle}>How to pay</Text>
        <View style={styles.paymentBox}>
          <Text style={styles.paymentLine}>Bank: {bankName}</Text>
          <Text style={styles.paymentLine}>Account Name: {accountName}</Text>
          <Text style={styles.paymentLine}>Account Number: {accountNumber}</Text>
          <Text style={styles.paymentLine}>Payment Reference: {paymentRemarkSuggestion}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{organisation.legalName ?? organisation.name}{organisation.hqAddress ? ` · ${organisation.hqAddress}` : ''}</Text>
          <Text style={styles.footerCredit}>Powered by EJO 100 Enterprise Platform</Text>
        </View>
      </Page>
    </Document>
  );
}
