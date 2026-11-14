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

export interface PortableLavbeSessionEnvelopeV1 {
  schemaVersion: 1;
  sessionId: string;
  wheelId: string;
  engineVersion: 'selection-v1';
  createdAt: string;
  currentRevisionId: string;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  configRevisions: {
    id: string;
    wheel: LavbeSharedWheelConfigurationV1;
  }[];
  /**
   * @minItems 1
   * @maxItems 10000
   */
  rounds: {
    id: string;
    startedAt: string;
    reason: 'session-start' | 'manual-config-change' | 'mode-change';
  }[];
  cycle: {
    number: number;
    /**
     * @maxItems 1000
     */
    remainingEntryIds: string[];
    /**
     * @maxItems 1000
     */
    excludedEntryIds: string[];
  };
  /**
   * @maxItems 10000
   */
  results: (
    | {
        id: string;
        roundId: string;
        configRevisionId: string;
        sequence: number;
        committedAt: string;
        presentation: 'pending' | 'revealed' | 'acknowledged';
        kind: 'entry';
        entryId: string;
        label: string;
      }
    | {
        id: string;
        roundId: string;
        configRevisionId: string;
        sequence: number;
        committedAt: string;
        presentation: 'pending' | 'revealed' | 'acknowledged';
        kind: 'number';
        value: number;
      }
    | {
        id: string;
        roundId: string;
        configRevisionId: string;
        sequence: number;
        committedAt: string;
        presentation: 'pending' | 'revealed' | 'acknowledged';
        kind: 'teams';
        /**
         * @minItems 2
         * @maxItems 50
         */
        teams: string[][];
      }
    | {
        id: string;
        roundId: string;
        configRevisionId: string;
        sequence: number;
        committedAt: string;
        presentation: 'pending' | 'revealed' | 'acknowledged';
        kind: 'card';
        entryId: string;
        label: string;
        cardId: string;
        text: string;
        status: 'pending' | 'completed' | 'skipped';
      }
  )[];
  game: {
    packId: string;
    packVersion: number;
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
    phase:
      'ready' | 'selecting-player' | 'revealing-card' | 'awaiting-complete-or-skip' | 'paused' | 'exhausted' | 'ended';
    /**
     * @maxItems 1000
     */
    usedCardIds: string[];
    activeResultId: string | null;
    nextTurnIndex: number;
    resumePhase: 'ready' | 'awaiting-complete-or-skip' | 'exhausted' | null;
    packSnapshot: LocalizedGamePackV1;
  } | null;
}
