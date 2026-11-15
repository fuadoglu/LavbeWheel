/* Generated from contracts/*.schema.json. Do not edit by hand. */

export interface PublishedLocalizedRouteApproval {
  locale: string;
  routeId: string;
  path: string;
  sourceHash: string;
  title: string;
  description: string;
  h1: string;
  /**
   * @minItems 6
   */
  modules: (
    'tool' | 'how-to' | 'rules' | 'examples' | 'privacy' | 'related-links' | 'accessible-alternative' | 'probability'
  )[];
  copyReviewer: string;
  copyReviewedAt: string;
  seoReviewer: string;
  seoReviewedAt: string;
  status: 'published';
}
