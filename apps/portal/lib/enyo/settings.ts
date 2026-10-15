/** Server-only helpers (never a 'use server' file: nothing here is callable from a browser). */
import { prisma } from '@ejo/database';
import { readLlmConfig, type LlmConfig } from '@ejo/enyo';
import { readLevels, type CapabilityKey, type Level } from './ml/capabilities';

export type EnyoSettings = {
  enabled: boolean;
  staffAssistant: boolean;
  customerAssistant: boolean;
  publicAssistant: boolean;
  mailAi: boolean;
  /** SHADOW | SUGGEST | OFF */
  predictionsMode: 'SHADOW' | 'SUGGEST' | 'OFF';
  displayName: string;
  /** The automation level of each learning capability (lib/enyo/ml/capabilities.ts). */
  capabilityLevels: Record<CapabilityKey, Level>;
  /** Learn only from records opened on or after this day (YYYY-MM-DD, Lagos); null = all history. */
  learnFrom: string | null;
};

export const DEFAULT_ENYO_SETTINGS: EnyoSettings = {
  enabled: true,
  staffAssistant: true,
  customerAssistant: true,
  publicAssistant: true,
  mailAi: true,
  predictionsMode: 'SHADOW',
  displayName: 'Enyo',
  capabilityLevels: readLevels(null),
  learnFrom: null,
};

/** The organisation's Enyo switches (defaults when never saved). Never throws: a read failure means "off". */
export async function getEnyoSettings(organisationId: string | null | undefined): Promise<EnyoSettings> {
  if (!organisationId) return { ...DEFAULT_ENYO_SETTINGS, enabled: false };
  try {
    const row = await prisma.enyoSetting.findUnique({ where: { organisationId } });
    if (!row) return DEFAULT_ENYO_SETTINGS;
    const mode = row.predictionsMode === 'SUGGEST' || row.predictionsMode === 'OFF' ? row.predictionsMode : 'SHADOW';
    return { enabled: row.enabled, staffAssistant: row.staffAssistant, customerAssistant: row.customerAssistant, publicAssistant: row.publicAssistant, mailAi: row.mailAi, predictionsMode: mode, displayName: row.displayName || 'Enyo', capabilityLevels: readLevels(row.capabilityLevels), learnFrom: row.learnFrom ? row.learnFrom.toISOString().slice(0, 10) : null };
  } catch {
    return { ...DEFAULT_ENYO_SETTINGS, enabled: false };
  }
}

export type EnyoFeature = 'staffAssistant' | 'customerAssistant' | 'publicAssistant' | 'mailAi';

/**
 * Whether a feature can run right now: a model is configured on the server
 * AND the organisation has the master switch and that feature on.
 */
export async function enyoReady(organisationId: string | null | undefined, feature: EnyoFeature): Promise<{ ready: true; config: LlmConfig; settings: EnyoSettings } | { ready: false; reason: 'not_configured' | 'switched_off'; settings: EnyoSettings }> {
  const settings = await getEnyoSettings(organisationId);
  const config = readLlmConfig();
  if (!config) return { ready: false, reason: 'not_configured', settings };
  if (!settings.enabled || !settings[feature]) return { ready: false, reason: 'switched_off', settings };
  return { ready: true, config, settings };
}
