import type { LavbeSharedWheelConfigurationV1 } from './generated/Wheel.js';

export type WheelConfig = LavbeSharedWheelConfigurationV1;
export type ToolKind = WheelConfig['tool'];
export type WheelEntry = WheelConfig['entries'][number];
export { canonicalJson, type CanonicalJsonValue } from './canonical-json.js';

export type { PortableLavbeSessionEnvelopeV1 as SessionEnvelope } from './generated/Session.js';
export type { LocalizedGamePackV1 as LocalizedPack } from './generated/Pack.js';
export type { PublishManifest } from './generated/PublishManifest.js';
export type { AdminIntegration } from './generated/AdminIntegration.js';
export type { AdminLegal } from './generated/AdminLegal.js';
export type { AdminPreset } from './generated/AdminPreset.js';
export type { AdminSeoCopy } from './generated/AdminSeoCopy.js';
export type { AdminUiCatalog } from './generated/AdminUiCatalog.js';
export type { PublishedLocalizedRouteApproval as SeoPublication } from './generated/SeoPublication.js';
