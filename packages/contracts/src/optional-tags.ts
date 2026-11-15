import type { AdminIntegration } from './generated/AdminIntegration.js';

export const disabledOptionalTags: AdminIntegration = {
  id: 'optional_tags', enabled: false, gtmId: null, ga4Id: null, publisherId: null, cmpProvider: null, placements: [],
};

export function isOptionalTagsConfiguration(value: unknown): value is AdminIntegration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return Object.keys(config).sort().join(',') === 'cmpProvider,enabled,ga4Id,gtmId,id,placements,publisherId'
    && config.id === 'optional_tags'
    && typeof config.enabled === 'boolean'
    && (config.gtmId === null || typeof config.gtmId === 'string' && /^GTM-[A-Z0-9]+$/.test(config.gtmId))
    && (config.ga4Id === null || typeof config.ga4Id === 'string' && /^G-[A-Z0-9]+$/.test(config.ga4Id))
    && (config.publisherId === null || typeof config.publisherId === 'string' && /^ca-pub-[0-9]{16}$/.test(config.publisherId))
    && (config.cmpProvider === null || config.cmpProvider === 'google-certified-configured')
    && Array.isArray(config.placements)
    && config.placements.every((placement) => ['desktop-rail', 'mobile-inline', 'lower-content'].includes(String(placement)))
    && new Set(config.placements).size === config.placements.length;
}

export function parseOptionalTagsConfiguration(serialized: string | undefined): AdminIntegration {
  if (!serialized) return disabledOptionalTags;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return isOptionalTagsConfiguration(parsed) ? parsed : disabledOptionalTags;
  } catch { return disabledOptionalTags; }
}


export function optionalTagsFromManifest(versions: readonly { payload?: { kind?: string; records?: unknown[] } }[]): AdminIntegration {
  const records = versions.flatMap((version) => version.payload?.kind === 'integration' ? version.payload.records ?? [] : []);
  if (records.length > 1) throw new Error('OPTIONAL_TAG_CONFIG_AMBIGUOUS');
  if (!records.length) return disabledOptionalTags;
  if (!isOptionalTagsConfiguration(records[0])) throw new Error('OPTIONAL_TAG_CONFIG_INVALID');
  return records[0];
}
