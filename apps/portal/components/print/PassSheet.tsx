import type { ReactNode } from 'react';

/**
 * A pass on 80 mm POS paper, printed once per copy (e.g. Organisation copy
 * kept at the gate, Holder / Visitor copy handed over) with a cut line
 * between — the organisation's logo and name, a boxed title, the content
 * and an optional note box.
 */
export function PassSheet({ copies, orgName, subName, title, children, note }: { copies: string[]; orgName: string; subName?: string | null; title: string; children: ReactNode; note?: string }) {
  const logo = `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`;
  return (
    <div style={{ width: '72mm', margin: '0 auto', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A', fontSize: '11px' }}>
      <style>{`@page { size: 80mm auto; margin: 3mm; } @media print { body { margin: 0; } }`}</style>
      {copies.map((copy, i) => (
        <div key={copy}>
          {i > 0 ? <div style={{ borderTop: '1px dashed #64748B', margin: '10px 0', textAlign: 'center', fontSize: '9px', color: '#64748B' }}>✂ cut here</div> : null}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" style={{ height: '28px', objectFit: 'contain' }} />
            <div style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.02em' }}>{orgName}</div>
            {subName ? <div style={{ fontSize: '10px', color: '#475569' }}>{subName}</div> : null}
            <div style={{ fontSize: '9px', fontWeight: 700, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{copy}</div>
          </div>
          <div style={{ border: '1.5px solid #0F172A' }}>
            <div style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'center', fontWeight: 700, padding: '4px', fontSize: '13px' }}>{title}</div>
            <div style={{ padding: '6px' }}>{children}</div>
            {note ? <div style={{ borderTop: '1.5px solid #0F172A', padding: '5px', fontSize: '9.5px', fontWeight: 600 }}>{note}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "Label: value" line with a dotted rule, like the paper form. */
export function PassLine({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', gap: '4px', margin: '3px 0', alignItems: 'baseline' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{label}:</span>
      <span style={{ flex: 1, borderBottom: '1px dotted #64748B', fontWeight: 600, minHeight: '1em' }}>{value ?? ''}</span>
    </div>
  );
}
