/**
 * Server-only: whether Enyo may answer on the website right now, and which
 * organisation the public website belongs to. Mirrors the staff portal's
 * apps/portal/lib/enyo/settings.ts (the two apps never import each other).
 */
import { prisma } from '@ejo/database';
import { readLlmConfig, type LlmConfig } from '@ejo/enyo';
import { siteConfig } from '@/lib/site-config';

export type WebsiteEnyoFeature = 'customerAssistant' | 'publicAssistant';

export type WebsiteEnyoSettings = { enabled: boolean; customerAssistant: boolean; publicAssistant: boolean; displayName: string };

const DEFAULTS: WebsiteEnyoSettings = { enabled: true, customerAssistant: true, publicAssistant: true, displayName: 'Enyo' };

/** The organisation's switches (defaults when never saved). A read failure means "off". */
export async function getWebsiteEnyoSettings(organisationId: string | null | undefined): Promise<WebsiteEnyoSettings> {
  if (!organisationId) return { ...DEFAULTS, enabled: false };
  try {
    const row = await prisma.enyoSetting.findUnique({
      where: { organisationId },
      select: { enabled: true, customerAssistant: true, publicAssistant: true, displayName: true },
    });
    if (!row) return DEFAULTS;
    return { enabled: row.enabled, customerAssistant: row.customerAssistant, publicAssistant: row.publicAssistant, displayName: row.displayName?.trim() || 'Enyo' };
  } catch {
    return { ...DEFAULTS, enabled: false };
  }
}

export type Readiness =
  | { ready: true; config: LlmConfig; settings: WebsiteEnyoSettings }
  | { ready: false; reason: 'not_configured' | 'switched_off'; settings: WebsiteEnyoSettings };

/** A model is configured on the server AND the organisation has the master switch and this assistant on. */
export async function websiteEnyoReady(organisationId: string | null | undefined, feature: WebsiteEnyoFeature): Promise<Readiness> {
  const settings = await getWebsiteEnyoSettings(organisationId);
  const config = readLlmConfig();
  if (!config) return { ready: false, reason: 'not_configured', settings };
  if (!organisationId || !settings.enabled || !settings[feature]) return { ready: false, reason: 'switched_off', settings };
  return { ready: true, config, settings };
}

/** Calm words for each "not now". Never technical. */
export function notReadyMessage(reason: 'not_configured' | 'switched_off', mode: 'CUSTOMER' | 'PUBLIC'): string {
  const reach = mode === 'CUSTOMER' ? 'call or email your branch — their details are under Help & support' : 'call or email us — our details are on the Contact page';
  return reason === 'not_configured'
    ? `The chat assistant is not switched on yet. Please ${reach}.`
    : `The chat assistant is switched off at the moment. Please ${reach}.`;
}

// ── The website's organisation ──────────────────────────────────────────

export type SiteOrganisation = { id: string; name: string };

let memo: { at: number; value: SiteOrganisation | null } | null = null;
const MEMO_MS = 5 * 60_000;

/**
 * The organisation this public website belongs to (each installation is one
 * company's site). In order: WEBSITE_ORGANISATION_SLUG (server setting, read
 * at run time), NEXT_PUBLIC_ACTIVE_ORGANISATION_SLUG, an organisation whose
 * name or legal name is the site's configured name, or the only active
 * organisation. None found → null, and the public assistant stays off.
 */
export async function siteOrganisation(): Promise<SiteOrganisation | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  let value: SiteOrganisation | null = null;
  try {
    const slug = (process.env.WEBSITE_ORGANISATION_SLUG || process.env.NEXT_PUBLIC_ACTIVE_ORGANISATION_SLUG || '').trim();
    const select = { id: true, name: true } as const;
    if (slug) value = await prisma.organisation.findFirst({ where: { slug, isActive: true }, select });
    if (!value) {
      const names = [...new Set([siteConfig.organisationName, siteConfig.legalName].filter(Boolean))];
      value = await prisma.organisation.findFirst({ where: { isActive: true, OR: [{ name: { in: names } }, { legalName: { in: names } }] }, orderBy: { createdAt: 'asc' }, select });
    }
    if (!value) {
      const all = await prisma.organisation.findMany({ where: { isActive: true }, take: 2, select });
      value = all.length === 1 ? all[0]! : null;
    }
  } catch {
    // Not remembered: the next request tries again.
    return null;
  }
  memo = { at: Date.now(), value };
  return value;
}
