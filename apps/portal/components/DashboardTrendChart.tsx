'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { DashboardTrendPoint } from '@/lib/actions/dashboard';

const naira = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/**
 * The last 14 working days, ending today: Job Cards and Vehicle Services
 * opened (bars) and, for managers, money collected and refunded (lines —
 * shown separately so a refund day never looks like negative revenue).
 */
export function DashboardTrendChart({ data, showRevenue }: { data: DashboardTrendPoint[]; showRevenue: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} />
        <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} width={32} />
        {showRevenue ? <YAxis yAxisId="money" orientation="right" tickFormatter={(v: number) => naira(v)} tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} width={84} /> : null}
        <Tooltip
          formatter={(value, name) => (name === 'Collected' || name === 'Refunded' ? naira(Number(value ?? 0)) : `${value ?? 0}`)}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload as DashboardTrendPoint | undefined;
            return p && showRevenue ? `${String(label)} — net ${naira(p.net)}` : String(label);
          }}
          contentStyle={{ background: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 8, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="count" dataKey="jobCardsOpened" name="Job Cards opened" stackId="opened" fill="var(--ejo-primary)" radius={[0, 0, 0, 0]} />
        <Bar yAxisId="count" dataKey="servicesOpened" name="Vehicle Services opened" stackId="opened" fill="var(--ejo-info)" radius={[3, 3, 0, 0]} />
        {showRevenue ? <Line yAxisId="money" type="monotone" dataKey="collected" name="Collected" stroke="var(--ejo-success)" strokeWidth={2} dot={false} /> : null}
        {showRevenue ? <Line yAxisId="money" type="monotone" dataKey="refunded" name="Refunded" stroke="var(--ejo-error)" strokeWidth={2} dot={false} /> : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
