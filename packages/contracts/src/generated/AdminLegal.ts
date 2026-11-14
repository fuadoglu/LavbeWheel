/* Generated from contracts/*.schema.json. Do not edit by hand. */

export interface AdminLegal {
  document: 'privacy' | 'cookies' | 'terms';
  version: number;
  effectiveAt: string;
  bodyMarkdown: string;
  operatorRevision: string;
}
