'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';

export type MileageChartPoint = { label: string; mileage: number; dateLabel: string; source: 'VEHICLE_SERVICE' | 'JOB_CARD' };

/**
 * Every point here is a real, recorded odometer reading at an actual
 * visit — never smoothed, never interpolated. The one predicted
 * point (the next service due odometer, if known) is drawn as a
 * distinct hollow marker past the real data, clearly a projection
 * rather than another real reading.
 */
export function VehicleMileageTrendChart({ data, predictedMileage, predictedLabel }: { data: MileageChartPoint[]; predictedMileage?: number | null; predictedLabel?: string }) {
  const chartData = predictedMileage != null ? [...data, { label: predictedLabel ?? 'Predicted', mileage: predictedMileage, dateLabel: 'Estimated', source: 'VEHICLE_SERVICE' as const }] : data;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--ejo-border)" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ejo-text-muted)' }} axisLine={{ stroke: 'var(--ejo-border)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--ejo-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toLocaleString('en-NG')}`} width={56} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--ejo-surface)', border: '1px solid var(--ejo-border)', borderRadius: 8, fontSize: 12 }}
          formatter={(value, _name, item) => [`${Number(value ?? 0).toLocaleString('en-NG')} km`, item.payload.dateLabel]}
        />
        <Line type="monotone" dataKey="mileage" stroke="var(--ejo-primary)" strokeWidth={2} dot={{ r: 3, fill: 'var(--ejo-primary)' }} />
        {predictedMileage != null && data.length > 0 ? (
          <ReferenceDot
            x={predictedLabel ?? 'Predicted'}
            y={predictedMileage}
            r={5}
            fill="var(--ejo-surface)"
            stroke="var(--ejo-warning)"
            strokeWidth={2}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}
