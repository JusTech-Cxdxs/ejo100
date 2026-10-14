'use client';

import dynamic from 'next/dynamic';

/** The charting library loads only on the Learning page, with a quiet placeholder meanwhile. */
export const LearningAccuracyChartLazy = dynamic(() => import('./LearningAccuracyChart').then((m) => m.LearningAccuracyChart), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full animate-pulse rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)]" aria-hidden="true" />,
});
