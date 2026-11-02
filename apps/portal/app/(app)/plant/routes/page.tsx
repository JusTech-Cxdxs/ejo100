import { guardPage } from '@/lib/authz/server';
import { listRoutes } from '@/lib/actions/plant-line';
import { PageHeader, SectionCard } from '@/components/ui';
import { RouteEditor } from '@/components/plant/RouteEditor';
import { STATION_KIND_WORDS } from '@/lib/plant/line';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** The routes down the line, one per model family: stations, checks and standard times, saved in versions. */
export default async function RoutesPage() {
  await guardPage('plant.view', '/plant/routes');
  const r = await listRoutes();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="sitemap" back={{ href: '/plant/line', label: 'Back to the line' }} eyebrow={r.plant?.name} title="Routes" description="How each model family goes down the line: its stations in order, the checks at each (pass/fail, or a measurement with limits), and the standard time. Saving makes a new version; vehicles already on the line keep the stations they started with." />
      {r.routes.map((route) => (
        <SectionCard key={route.familyKey} icon="sitemap" title={route.name} description={`${route.isDefault ? 'The built-in route (no version saved yet)' : `Version ${route.version}, saved ${route.updatedAt ? formatDateTimeCompact(route.updatedAt) : ''}`} · ${route.stations.length} stations, ${route.stations.reduce((n, s) => n + s.checks.length, 0)} checks, ${route.stations.reduce((n, s) => n + s.standardMinutes, 0)} minutes standard${route.vehiclesOnIt ? ` · ${route.vehiclesOnIt} on the line with it` : ''}`}>
          <ol className="mb-4 flex flex-wrap gap-2" aria-label={`${route.name}: stations`}>
            {route.stations.map((s) => <li key={s.code} className="rounded-full border border-[var(--ejo-border)] px-3 py-1 text-xs text-[var(--ejo-text)]"><span className="font-mono text-[var(--ejo-text-muted)]">{s.code}</span> {s.name} <span className="text-[var(--ejo-text-muted)]">· {STATION_KIND_WORDS[s.kind].toLowerCase()} · {s.standardMinutes} min · {s.checks.length} checks</span></li>)}
          </ol>
          {r.may.manage ? <RouteEditor familyKey={route.familyKey} name={route.name} text={route.text} /> : null}
        </SectionCard>
      ))}
    </div>
  );
}
