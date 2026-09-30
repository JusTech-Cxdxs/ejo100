import type { ReactNode } from 'react';

const ACCENT = '#16A34A';

/**
 * A pass on a POS receipt roll (58 / 80 mm): fills the roll's width, with
 * the same header as every EJO document — logo beside the organisation
 * wordmark ("Kewalram" over an accent rule and "Chanrai Group") — then the
 * copy label, a boxed title, the content and an optional note.
 */
export function PassSheet({ copyLabel, orgName, subName, title, children, note }: { copyLabel: string; orgName: string; subName?: string | null; title: string; children: ReactNode; note?: string }) {
  const logo = `${process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app'}/images/logo/logo.png`;
  const words = orgName.trim().split(/\s+/);
  const top = words[0] ?? orgName;
  const bottom = words.slice(1).join(' ');
  return (
    <div style={{ width: '100%', maxWidth: '80mm', margin: '0 auto', padding: '2mm', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0F172A', fontSize: '11px' }}>
      <style>{`@page { size: 80mm auto; margin: 0; } @media print { html, body { margin: 0; padding: 0; } }`}</style>
      <div style={{ border: '1.5px solid #0F172A' }}>
        {/* Header box — joined to the title box below */}
        <div style={{ padding: '6px 6px 4px', borderBottom: '1.5px solid #0F172A' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={orgName} style={{ width: '26px', height: '31px', display: 'block', marginRight: '4px' }} />
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.01em', whiteSpace: 'nowrap', lineHeight: 1 }}>{top}</div>
              {bottom ? (
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '3px' }}>
                  <div style={{ flex: 1, borderBottom: `1px solid ${ACCENT}`, marginRight: '4px' }} />
                  <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{bottom}</span>
                </div>
              ) : null}
            </div>
          </div>
          {subName ? <div style={{ textAlign: 'center', fontSize: '9.5px', color: '#475569', marginTop: '3px' }}>{subName}</div> : null}
          <div style={{ textAlign: 'center', fontSize: '9px', fontWeight: 700, marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.06em', color: ACCENT }}>{copyLabel}</div>
        </div>
        <div style={{ borderBottom: '1.5px solid #0F172A', textAlign: 'center', fontWeight: 700, padding: '4px', fontSize: '13px' }}>{title}</div>
        <div style={{ padding: '6px' }}>{children}</div>
        {note ? <div style={{ borderTop: '1.5px solid #0F172A', padding: '5px', fontSize: '9.5px', fontWeight: 600 }}>{note}</div> : null}
      </div>
      <div style={{ textAlign: 'center', fontSize: '8.5px', color: '#64748B', marginTop: '4px' }}>Printed {new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      <div style={{ textAlign: 'center', fontSize: '8px', color: '#CBD5E1', marginTop: '2px' }}>Powered by EJO 100 Enterprise Platform</div>
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
