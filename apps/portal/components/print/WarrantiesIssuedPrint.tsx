import { formatDateOnly } from '@/lib/utils/format-date';

type Row = {
  id: string;
  warrantyNumber: string;
  kind: string;
  subjectDescription: string;
  endsAt: Date;
  startReading: number | null;
  distanceLimit: number | null;
  provider: { name: string };
  policy: { isSample: boolean };
};

/**
 * "Warranties issued" on printed Job Cards, Vehicle Services and Parts
 * Requests (both copies) — so the paper the customer takes home is also
 * their warranty receipt, and every number traces back in EJO 100.
 */
export function WarrantiesIssuedPrint({ warranties }: { warranties: Row[] }) {
  if (warranties.length === 0) return null;
  const cell = { padding: '4px 6px', borderBottom: '1px solid #E2E8F0', fontSize: '11px', verticalAlign: 'top' } as const;
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', letterSpacing: '0.04em' }}>WARRANTIES ISSUED</div>
      <table role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px' }}>
        <tbody>
          <tr>
            <td style={{ ...cell, fontWeight: 700, color: '#475569' }}>Warranty No.</td>
            <td style={{ ...cell, fontWeight: 700, color: '#475569' }}>Covers</td>
            <td style={{ ...cell, fontWeight: 700, color: '#475569' }}>Provider</td>
            <td style={{ ...cell, fontWeight: 700, color: '#475569' }}>Valid until (whichever first)</td>
          </tr>
          {warranties.map((w) => (
            <tr key={w.id}>
              <td style={{ ...cell, fontWeight: 700 }}>{w.warrantyNumber}</td>
              <td style={cell}>{w.subjectDescription}</td>
              <td style={cell}>{w.provider.name}{w.policy.isSample ? ' (sample terms)' : ''}</td>
              <td style={cell}>
                {formatDateOnly(w.endsAt)}
                {w.startReading !== null && w.distanceLimit !== null ? ` or ${(w.startReading + w.distanceLimit).toLocaleString('en-NG')} km` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#64748B' }}>Keep this document. Quote the warranty number when reporting a problem with any of these items.</p>
    </div>
  );
}
