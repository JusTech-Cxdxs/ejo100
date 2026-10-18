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
        <defs>
          <linearGradient id="ejo-jc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--ejo-primary)" stopOpacity={1} /><stop offset="100%" stopColor="var(--ejo-primary)" stopOpacity={0.75} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} width={32} axisLine={false} tickLine={false} />
        {showRevenue ? <YAxis yAxisId="money" orientation="right" tickFormatter={(v: number) => naira(v)} tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} width={84} axisLine={false} tickLine={false} /> : null}
        <Tooltip
          formatter={(value, name) => (name === 'Collected' || name === 'Refunded' ? naira(Number(value ?? 0)) : `${value ?? 0}`)}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload as DashboardTrendPoint | undefined;
            return p && showRevenue ? `${String(label)} — net ${naira(p.net)}` : String(label);
          }}
          cursor={{ fill: 'var(--ejo-primary)', fillOpacity: 0.06 }}
          contentStyle={{ background: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 10, fontSize: 12, boxShadow: '0 10px 30px -12px rgba(0,0,0,0.25)' }}
          labelStyle={{ color: 'var(--ejo-text)', fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar yAxisId="count" dataKey="jobCardsOpened" name="Job Cards opened" stackId="opened" fill="url(#ejo-jc)" radius={[0, 0, 0, 0]} maxBarSize={36} />
        <Bar yAxisId="count" dataKey="servicesOpened" name="Vehicle Services opened" stackId="opened" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={36} />
        {showRevenue ? <Line yAxisId="money" type="monotone" dataKey="collected" name="Collected" stroke="#64748b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /> : null}
        {showRevenue ? <Line yAxisId="money" type="monotone" dataKey="refunded" name="Refunded" stroke="var(--ejo-error)" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} /> : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
