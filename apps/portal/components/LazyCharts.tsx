'use client';

import dynamic from 'next/dynamic';

/**
 * Charts load their charting library only when a chart is actually on the
 * page (≈117 kB that most pages never need), with a quiet placeholder of the
 * same height meanwhile — so the rest of the page is interactive at once.
 */
function Placeholder({ height = 240 }: { height?: number }) {
  return <div className="w-full animate-pulse rounded-[var(--ejo-radius-md)] bg-[var(--ejo-surface)]" style={{ height }} aria-hidden="true" />;
}

export const DashboardTrendChart = dynamic(() => import('./DashboardTrendChart').then((m) => m.DashboardTrendChart), { ssr: false, loading: () => <Placeholder /> });
export const VehicleFindingsBreakdownChart = dynamic(() => import('./VehicleFindingsBreakdownChart').then((m) => m.VehicleFindingsBreakdownChart), { ssr: false, loading: () => <Placeholder /> });
export const VehicleMileageTrendChart = dynamic(() => import('./VehicleMileageTrendChart').then((m) => m.VehicleMileageTrendChart), { ssr: false, loading: () => <Placeholder /> });
export const VehicleVisitHistoryChart = dynamic(() => import('./VehicleVisitHistoryChart').then((m) => m.VehicleVisitHistoryChart), { ssr: false, loading: () => <Placeholder /> });
