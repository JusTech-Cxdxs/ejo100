'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ModuleStatusBadge } from '@ejo/ui';
import type { NavItem } from '@/lib/authz/navigation';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';
import { ROADMAP } from '@/lib/roadmap';
import { RoadmapIcon } from './RoadmapIcon';

/**
 * Renders the modules THIS person may open (worked out on the server from
 * their roles — lib/authz/navigation.ts); every page still checks again.
 */
export function Sidebar({ items, organisationName }: { items: NavItem[]; organisationName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <div className="border-b border-[var(--ejo-border)] px-5 py-5">
        <Wordmark name={organisationName} />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((mod) => {
          const active = pathname === mod.href || pathname.startsWith(`${mod.href}/`);
          return (
            <Link
              key={mod.key}
              href={mod.href}
              className={`flex items-center justify-between rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'
                  : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'
              }`}
            >
              <span>{mod.name}</span>
              {mod.status !== 'LIVE' && <ModuleStatusBadge status={mod.status as never} />}
            </Link>
          );
        })}
        {/* What is planned next — shown to everyone, so nobody mistakes "not yet" for "never". */}
        <details open className="group pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming next</span>
            <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
          </summary>
          <div className="mt-1 space-y-0.5" aria-label="Roadmap">
            <Link href="/roadmap" className={`flex items-center rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-xs font-medium ${pathname === '/roadmap' ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}>The full roadmap →</Link>
            {ROADMAP.map((m) => {
              const href = `/roadmap/${m.key}`;
              const active = pathname === href;
              return (
                <Link key={m.key} href={href} className={`flex items-center justify-between gap-2 rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-[13px] transition-colors ${active ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}>
                  <span className="flex min-w-0 items-center gap-2"><RoadmapIcon icon={m.icon} size={15} className="shrink-0 opacity-70" /><span className="truncate">{m.name}</span></span>
                  <span className="shrink-0 rounded-full border border-[var(--ejo-warning)]/40 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--ejo-warning)]">Soon</span>
                </Link>
              );
            })}
          </div>
        </details>
      </nav>

      <div className="border-t border-[var(--ejo-border)] px-5 py-4">
        <PoweredByEjo />
      </div>
    </aside>
  );
}
