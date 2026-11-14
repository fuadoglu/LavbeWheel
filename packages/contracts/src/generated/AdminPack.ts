/* Generated from contracts/*.schema.json. Do not edit by hand. */

export type LocalizedGamePackV1 = {
  schemaVersion: 1;
  id: string;
  version: number;
  family: 'icebreakers' | 'friends' | 'couples' | 'truth' | 'dare' | 'family';
  locale:
    | 'en'
    | 'az'
    | 'tr'
    | 'ru'
    | 'es'
    | 'pt'
    | 'pt-BR'
    | 'de'
    | 'fr'
    | 'it'
    | 'nl'
    | 'pl'
    | 'uk'
    | 'ro'
    | 'hu'
    | 'cs'
    | 'sk'
    | 'bg'
    | 'sr'
    | 'hr'
    | 'bs'
    | 'sl'
    | 'mk'
    | 'sq'
    | 'en-GB'
    | 'el'
    | 'sv'
    | 'no'
    | 'da'
    | 'fi'
    | 'is'
    | 'et'
    | 'lv'
    | 'lt'
    | 'ar'
    | 'he'
    | 'fa'
    | 'ur'
    | 'ps'
    | 'ku'
    | 'ckb'
    | 'hi'
    | 'bn'
    | 'pa'
    | 'gu'
    | 'mr'
    | 'ne'
    | 'si'
    | 'ta'
    | 'te'
    | 'kn'
    | 'ml'
    | 'or'
    | 'as'
    | 'zh-Hans'
    | 'zh-Hant'
    | 'ja'
    | 'ko'
    | 'vi'
    | 'th'
    | 'id'
    | 'ms'
    | 'fil'
    | 'jv'
    | 'su'
    | 'km'
    | 'lo'
    | 'my'
    | 'mn'
    | 'kk'
    | 'ky'
    | 'uz'
    | 'tk'
    | 'tg'
    | 'ka'
    | 'hy'
    | 'sw'
    | 'am'
    | 'ha'
    | 'yo'
    | 'ig'
    | 'zu'
    | 'xh'
    | 'af'
    | 'so'
    | 'om'
    | 'rw'
    | 'mg'
    | 'sn'
    | 'st'
    | 'tn'
    | 'ny'
    | 'wo'
    | 'ff'
    | 'ht'
    | 'ca'
    | 'eu'
    | 'gl'
    | 'cy'
    | 'ga'
    | 'gd'
    | 'mt'
    | 'lb'
    | 'be'
    | 'la'
    | 'eo'
    | 'mi'
    | 'sm'
    | 'haw'
    | 'fy';
  minPlayers: number;
  maxPlayers: number;
  audience: 'family' | 'teen' | 'adult';
  intensity: 'gentle' | 'playful' | 'bold';
  /**
   * @minItems 1
   * @maxItems 1000
   */
  cards: {
    id: string;
    kind: 'question' | 'dare' | 'activity';
    text: string;
    /**
     * @maxItems 10
     */
    equipment: string[];
    estimatedSeconds: number;
  }[];
  review: {
    status: 'draft' | 'validated' | 'reviewed';
    sourceHash: string;
    reviewer?: string;
    reviewedAt?: string;
  };
};
