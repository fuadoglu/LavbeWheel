/* Generated from contracts/*.schema.json. Do not edit by hand. */

/**
 * Label and title maxLength are defensive code-point limits; enforce grapheme limits and semantic constraints separately. This is configuration, not session/report data.
 */
export type LavbeSharedWheelConfigurationV1 = {
  schemaVersion: 1;
  tool: 'names' | 'numbers' | 'yes-no' | 'weighted' | 'teams' | 'bottle' | 'game';
  title: string;
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
  mode: 'independent' | 'remove-winner' | 'shuffled-cycle';
  /**
   * @minItems 0
   * @maxItems 1000
   */
  entries: {
    id: string;
    label: string;
    weight: number;
    active: boolean;
  }[];
  settings: {
    theme: 'system' | 'light' | 'dark';
    style: 'classic' | 'bottle' | 'couples' | 'friends' | 'education';
    motion: 'quiet' | 'standard' | 'party';
    sound: boolean;
    spinSeconds: number;
  };
  range?: {
    min: number;
    max: number;
  };
  teamCount?: number;
  /**
   * @minItems 2
   * @maxItems 20
   */
  seats?: string[];
  game?: {
    packId: string;
    packVersion: number;
  };
};
