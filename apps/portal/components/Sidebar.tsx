'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ModuleStatusBadge } from '@ejo/ui';
import type { NavItem } from '@/lib/authz/navigation';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';

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
      </nav>

      <div className="border-t border-[var(--ejo-border)] px-5 py-4">
        <PoweredByEjo />
      </div>
    </aside>
  );
}
