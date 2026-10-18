'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { WeekPoint } from '@/lib/enyo/predict/learning-core';

/**
 * Accuracy per week: precision and recall (lines, %), and how many
 * predictions were resolved (bars). Weeks with nothing resolved show a gap.
 */
export function LearningAccuracyChart({ data }: { data: WeekPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} width={40} axisLine={false} tickLine={false} />
        <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} width={32} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => (name === 'Resolved' ? `${value ?? 0}` : value === null || value === undefined ? '—' : `${value}%`)}
          cursor={{ fill: 'var(--ejo-primary)', fillOpacity: 0.06 }}
          contentStyle={{ background: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 10, fontSize: 12, boxShadow: '0 10px 30px -12px rgba(0,0,0,0.25)' }}
          labelStyle={{ color: 'var(--ejo-text)', fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Bar yAxisId="count" dataKey="resolved" name="Resolved" fill="#fee2e2" stroke="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Line yAxisId="pct" type="monotone" dataKey="precision" name="Precision" stroke="var(--ejo-primary)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        <Line yAxisId="pct" type="monotone" dataKey="recall" name="Recall" stroke="#64748b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
