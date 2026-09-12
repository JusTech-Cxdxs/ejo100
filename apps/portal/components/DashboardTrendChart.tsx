'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardTrendPoint } from '@/lib/actions/dashboard';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

/**
 * Real figures over the real last 14 days — never a projection. Both
 * series share one chart deliberately, on two real axes (Job Cards
 * as a plain count, Revenue in naira), since the real, interesting
 * story here is usually how the two move together, not either one
 * viewed alone.
 */
export function DashboardTrendChart({ data, showRevenue }: { data: DashboardTrendPoint[]; showRevenue: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ejoJobCardsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--ejo-primary)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--ejo-primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ejoRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--ejo-info)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--ejo-info)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={{ stroke: 'var(--ejo-border)' }} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
        {showRevenue ? (
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNaira(v)} />
        ) : null}
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => (name === 'Revenue' ? [formatNaira(Number(value ?? 0)), name] : [value, name])}
        />
        <Area yAxisId="left" type="monotone" dataKey="jobCardsOpened" name="Job Cards Opened" stroke="var(--ejo-primary)" fill="url(#ejoJobCardsGradient)" strokeWidth={2} />
        {showRevenue ? (
          <Area yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="var(--ejo-info)" fill="url(#ejoRevenueGradient)" strokeWidth={2} />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}
