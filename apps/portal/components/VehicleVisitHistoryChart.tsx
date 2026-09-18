'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { VehicleVisitMonth } from '@/lib/actions/vehicle-service';

/**
 * Real counts per real month — Vehicle Service visits and Job Card
 * repairs shown side by side so the real balance between routine
 * maintenance and actual repair work is visible at a glance, not
 * blended into one number.
 */
export function VehicleVisitHistoryChart({ data }: { data: VehicleVisitMonth[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--ejo-text-muted)' }} axisLine={{ stroke: 'var(--ejo-border)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip contentStyle={{ backgroundColor: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="vehicleServiceCount" name="Vehicle Service" fill="var(--ejo-success)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="jobCardCount" name="Job Card" fill="var(--ejo-primary)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
