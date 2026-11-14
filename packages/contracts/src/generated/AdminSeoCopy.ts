/* Generated from contracts/*.schema.json. Do not edit by hand. */

export interface AdminSeoCopy {
  routeId:
    | 'home'
    | 'random-name-picker'
    | 'random-number-picker'
    | 'yes-or-no-wheel'
    | 'weighted-wheel'
    | 'team-generator'
    | 'spin-the-bottle'
    | 'truth-or-dare'
    | 'couples-games'
    | 'group-games';
  title: string;
  description: string;
  heading: string;
  bodyMarkdown: string;
  sourceHash: string;
}
