import type { RoadmapModule } from '@/lib/roadmap';

const PATHS: Record<RoadmapModule['icon'], React.ReactNode> = {
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A5 5 0 0 1 21 19" /></>,
  payroll: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5h.01M17.5 14.5h.01" /></>,
  finance: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  procurement: <><path d="M6 6h15l-1.5 9h-12z" /><path d="M6 6 5 3H2" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /></>,
  suppliers: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  warehouse: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-7h10v7M7 17h10" /></>,
  factory: <><path d="M3 21V11l5 3V11l5 3V7l8 4v10z" /><path d="M7 18h2M12 18h2M17 18h2" /></>,
  documents: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  reports: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  crm: <><path d="M4 5h16v10H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
  assets: <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7V5h8v2M3 12h18" /></>,
  mobile: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  ai: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3.5" /></>,
  plug: <><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5" /></>,
  brand: <><circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.3" /><circle cx="12" cy="7.5" r="1.3" /><circle cx="15.5" cy="10" r="1.3" /><path d="M12 21a3 3 0 0 1 0-6h2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /><path d="M12 3v2M21 12h-2" /></>,
  chat: <><path d="M4 5h12v8H9l-4 3v-3H4z" /><path d="M16 9h4v8h-1v3l-4-3h-4v-2" /></>,
  flow: <><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="15" y="9.5" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><path d="M9 5.5h3v13H9M12 12h3" /></>,
  car: <><path d="M5 16V11l2-5h10l2 5v5" /><path d="M3 16h18v2H3zM5 11h14" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" /></>,
  contract: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 11h7M9 14h5" /><path d="M9 18c1-1.2 1.8-1.2 2.5 0s1.5 1.2 2.5 0" /></>,
  checklist: <><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /><path d="M11 6h9M11 12h9M11 18h9" /></>,
  star: <><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  receipt: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  fleet: <><path d="M2 15V9h9v6M11 11h4l3 3v1h-7" /><path d="M13 19h9v-4l-2-2" /><circle cx="5" cy="16.5" r="1.5" /><circle cx="15" cy="17" r="1.5" /></>,
  tablet: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M8 8l2 2-2 2M12 12h4M11 18h2" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" /><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" /></>,
};

export function RoadmapIcon({ icon, size = 18, className }: { icon: RoadmapModule['icon']; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[icon]}
    </svg>
  );
}
