'use client';

import dynamic from 'next/dynamic';

/** The charting library loads only where a chart is shown (see components/LazyCharts.tsx). */
function Placeholder() {
  return <div className="w-full animate-pulse rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)]" style={{ height: 240 }} aria-hidden="true" />;
}

export const SpendChart = dynamic(() => import('./SpendChart').then((m) => m.SpendChart), { ssr: false, loading: () => <Placeholder /> });
