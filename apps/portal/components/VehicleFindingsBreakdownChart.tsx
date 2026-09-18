'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { VehicleFindingsBreakdown } from '@/lib/actions/vehicle-service';

// Same real severity colors already used on the inspection workspace
// and print documents — never a different palette for the same real
// meaning.
const SEVERITY_COLORS = {
  Good: '#16A34A',
  Attention: '#CA8A04',
  'Service Required': '#EA580C',
  Critical: '#DC2626',
};

export function VehicleFindingsBreakdownChart({ data }: { data: VehicleFindingsBreakdown }) {
  const chartData = [
    { name: 'Good', value: data.good },
    { name: 'Attention', value: data.attention },
    { name: 'Service Required', value: data.serviceRequired },
    { name: 'Critical', value: data.critical },
  ].filter((d) => d.value > 0);

  if (chartData.length === 0) {
    return <p className="py-8 text-center text-xs text-[var(--ejo-text-muted)]">No inspection findings recorded yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(d) => `${d.value}`}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
