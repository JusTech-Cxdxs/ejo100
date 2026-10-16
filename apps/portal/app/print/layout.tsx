import type { ReactNode } from 'react';

/**
 * Every printable document (Job Cards, Vehicle Services, estimates, passes,
 * procurement, parts requests, refunds, warranties, inspections…) carries
 * the organisation's logo as a very faint watermark across the page — on
 * every printed page, for the organisation's, the collector's and the
 * customer's copies alike. It never blocks reading or clicking.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div aria-hidden="true" className="ejo-print-watermark" />
    </>
  );
}
