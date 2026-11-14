/* Generated from contracts/*.schema.json. Do not edit by hand. */

export interface AdminIntegration {
  id: 'optional_tags';
  enabled: boolean;
  gtmId: string | null;
  ga4Id: string | null;
  publisherId: string | null;
  cmpProvider: 'google-certified-configured' | null;
  placements: ('desktop-rail' | 'mobile-inline' | 'lower-content')[];
}
