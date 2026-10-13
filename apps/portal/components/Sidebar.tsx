'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ModuleStatusBadge } from '@ejo/ui';
import type { NavItem } from '@/lib/authz/navigation';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';
import { ROADMAP } from '@/lib/roadmap';
import { RoadmapIcon } from './RoadmapIcon';
import { Icon, MODULE_ICON } from './ui/Icon';
import { useNotifications } from './NotificationProvider';
import { isApproval } from '@/lib/approvals';

/** The menu's sections. A module not listed here goes under "Operations". */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Overview', keys: ['dashboard', 'approvals', 'notifications', 'analytics'] },
  { title: 'Operations', keys: [] },
  { title: 'Administration', keys: ['organisation', 'structure', 'branches', 'users', 'roles', 'permissions', 'audit-logs', 'recycle-bin', 'settings'] },
];

function grouped(items: NavItem[]) {
  const placed = new Set(GROUPS.flatMap((g) => g.keys));
  return GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.length ? g.keys.map((k) => items.find((i) => i.key === k)).filter((i): i is NavItem => Boolean(i)) : items.filter((i) => !placed.has(i.key)),
  })).filter((g) => g.items.length > 0);
}

/**
 * Renders the modules THIS person may open (worked out on the server from
 * their roles — lib/authz/navigation.ts); every page still checks again.
 * Grouped, with icons; on desktops it can fold to icons only (remembered on
 * this browser), on phones and tablets it is the slide-in drawer.
 */
export function Sidebar({
  items,
  organisationName,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  variant = 'desktop',
}: {
  items: NavItem[];
  organisationName: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  variant?: 'desktop' | 'drawer';
}) {
  const pathname = usePathname();
  // Decisions waiting on this person — the same live list as the bell.
  const { summary } = useNotifications();
  const waiting = summary.actions.filter(isApproval).length;
  const mini = collapsed && variant === 'desktop';
  const linkBase = 'group relative flex items-center rounded-[var(--ejo-radius-md)] text-sm font-medium transition-colors';

  return (
    <aside className={`flex h-full flex-col border-r border-[var(--ejo-border)] bg-[var(--ejo-surface)] transition-[width] duration-200 ${mini ? 'w-[76px]' : 'w-72 lg:w-64'}`}>
      <div className={`flex h-16 shrink-0 items-center border-b border-[var(--ejo-border)] ${mini ? 'justify-center px-2' : 'justify-between gap-2 px-4'}`}>
        {mini ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/images/logo/logo.png" alt={organisationName} width={30} height={36} className="h-9 w-auto object-contain" />
        ) : (
          <div className="min-w-0"><Wordmark name={organisationName} /></div>
        )}
        {variant === 'drawer' ? (
          <button type="button" onClick={onNavigate} aria-label="Close menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]">
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </div>

      <nav aria-label="Main" className={`ejo-scroll flex-1 overflow-y-auto overscroll-contain py-3 ${mini ? 'px-2' : 'px-3'}`}>
        {grouped(items).map((g) => (
          <div key={g.title} className="mb-3">
            {mini ? <div className="mx-3 mb-2 mt-1 h-px bg-[var(--ejo-border)] first:hidden" aria-hidden="true" /> : (
              <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ejo-text-muted)]/80">{g.title}</p>
            )}
            <div className="space-y-0.5">
              {g.items.map((mod) => {
                const active = pathname === mod.href || pathname.startsWith(`${mod.href}/`);
                return (
                  <Link
                    key={mod.key}
                    href={mod.href}
                    onClick={onNavigate}
                    title={mini ? mod.name : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`${linkBase} ${mini ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'} ${
                      active
                        ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'
                        : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'
                    }`}
                  >
                    {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[var(--ejo-primary)]" aria-hidden="true" /> : null}
                    <span className={`flex shrink-0 items-center justify-center transition-transform group-hover:scale-110 ${active ? 'text-[var(--ejo-primary)]' : ''}`}>
                      <Icon name={MODULE_ICON[mod.key] ?? 'grid'} size={mini ? 20 : 18} />
                    </span>
                    <span className={mini ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{mod.name}</span>
                    {mod.key === 'approvals' && waiting > 0 ? (
                      <span className={mini ? 'absolute right-2 top-1 h-2 w-2 rounded-full bg-[var(--ejo-warning)]' : 'shrink-0 rounded-full bg-[var(--ejo-warning)]/15 px-2 py-px text-[11px] font-semibold text-[var(--ejo-warning-text)]'}>{mini ? null : waiting}</span>
                    ) : null}
                    {!mini && mod.status !== 'LIVE' ? <ModuleStatusBadge status={mod.status as never} /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* What is planned next — shown to everyone, so nobody mistakes "not yet" for "never". */}
        {mini ? (
          <Link href="/roadmap" title="Coming next — the roadmap" className={`${linkBase} justify-center py-2.5 ${pathname.startsWith('/roadmap') ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}>
            <Icon name="roadmap" size={20} /><span className="sr-only">Coming next</span>
            <span className="absolute right-3 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" aria-hidden="true" />
          </Link>
        ) : (
          <details open className="group mt-1 border-t border-[var(--ejo-border)] pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
              <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming next</span>
              <span className="transition-transform group-open:rotate-90" aria-hidden="true"><Icon name="chevron-right" size={14} /></span>
            </summary>
            <div className="mt-1 space-y-0.5" aria-label="Roadmap">
              <Link href="/roadmap" onClick={onNavigate} className={`flex items-center gap-2 rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-xs font-medium ${pathname === '/roadmap' ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}>The full roadmap →</Link>
              {ROADMAP.map((m) => {
                const href = `/roadmap/${m.key}`;
                const active = pathname === href;
                return (
                  <Link key={m.key} href={href} onClick={onNavigate} className={`flex items-center justify-between gap-2 rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-[13px] transition-colors ${active ? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-text)]'}`}>
                    <span className="flex min-w-0 items-center gap-2"><RoadmapIcon icon={m.icon} size={15} className="shrink-0 opacity-70" /><span className="truncate">{m.name}</span></span>
                    <span className="shrink-0 rounded-full border border-[var(--ejo-warning)]/40 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--ejo-warning-text)]">Soon</span>
                  </Link>
                );
              })}
            </div>
          </details>
        )}
      </nav>

      <div className={`shrink-0 border-t border-[var(--ejo-border)] ${mini ? 'flex flex-col items-center gap-2 px-2 py-3' : 'flex items-center justify-between gap-2 px-4 py-3'}`}>
        {mini ? null : <PoweredByEjo />}
        {variant === 'desktop' && onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ejo-text-muted)] transition-colors hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-primary)]"
          >
            <span className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}><Icon name="chevron-left" size={16} /></span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}
