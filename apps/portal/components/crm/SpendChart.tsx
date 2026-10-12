'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Month = { label: string; net: number; billed: number; refunds: number };

const short = (n: number) => (Math.abs(n) >= 1e6 ? `₦${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m` : Math.abs(n) >= 1e3 ? `₦${Math.round(n / 1e3)}k` : `₦${Math.round(n)}`);
const full = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

/** Twelve Lagos calendar months: what the customer paid (net of refunds) and the work billed to them. */
export function SpendChart({ data }: { data: Month[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="crmSpendBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ejo-accent)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--ejo-primary)" stopOpacity={0.85} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ejo-text-muted)' }} axisLine={{ stroke: 'var(--ejo-border)' }} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={short} tick={{ fontSize: 10, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          formatter={(v, name) => [full(Number(v ?? 0)), String(name)]}
          contentStyle={{ backgroundColor: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 10, fontSize: 12, color: 'var(--ejo-text)' }}
          cursor={{ fill: 'var(--ejo-primary)', fillOpacity: 0.06 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="net" name="Paid (net of refunds)" fill="url(#crmSpendBar)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="billed" name="Work billed" type="monotone" stroke="var(--ejo-brand)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
