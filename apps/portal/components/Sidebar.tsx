'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ModuleStatusBadge } from '@ejo/ui';
import { platformModules } from '@/lib/modules';
import { portalConfig } from '@/lib/site-config';

/**
 * Renders EVERY module in the registry, live or not — clicking a
 * COMING_SOON module still navigates to its (placeholder) page rather
 * than being hidden or disabled, per the "every route already exists"
 * rule. The badge is the only visual difference.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <div className="border-b border-[var(--ejo-border)] px-5 py-5">
        <p className="text-sm font-bold text-[var(--ejo-text)]">{portalConfig.companyName}</p>
        <p className="text-xs text-[var(--ejo-text-muted)]">{portalConfig.poweredBy}</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {platformModules.map((mod) => {
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
              {mod.status !== 'LIVE' && <ModuleStatusBadge status={mod.status} />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
