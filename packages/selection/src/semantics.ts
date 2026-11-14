import type { WheelConfig } from '@lavbe/contracts';

export type WheelSemanticError =
  | 'DUPLICATE_ENTRY_ID'
  | 'LABEL_TOO_LONG'
  | 'TITLE_TOO_LONG'
  | 'INVALID_RANGE'
  | 'INVALID_TEAM_COUNT'
  | 'INVALID_SEATS'
  | 'INVALID_WEIGHT_MODE'
  | 'NO_ACTIVE_ENTRIES';

const graphemeSegmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
function graphemeLength(value: string): number {
  return [...graphemeSegmenter.segment(value.normalize('NFC'))].length;
}

export function normalizeWheelForStorage<T extends WheelConfig>(wheel: T): T {
  return {
    ...wheel,
    title: wheel.title.normalize('NFC'),
    entries: wheel.entries.map((entry) => ({ ...entry, label: entry.label.normalize('NFC') })),
  };
}

/** Validate non-structural wheel invariants in the normative, shared order. */
export function validateWheelSemantics(wheel: WheelConfig): WheelSemanticError | 'OK' {
  const ids = wheel.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) return 'DUPLICATE_ENTRY_ID';
  if (wheel.entries.some((entry) => graphemeLength(entry.label) > 120)) return 'LABEL_TOO_LONG';
  if (graphemeLength(wheel.title) > 80) return 'TITLE_TOO_LONG';

  if (wheel.tool === 'numbers') {
    const range = wheel.range;
    if (!range || range.min > range.max || range.max - range.min + 1 > 10_000) return 'INVALID_RANGE';
  }
  const active = wheel.entries.filter((entry) => entry.active);
  const activeIds = new Set(active.map((entry) => entry.id));
  if (wheel.tool === 'teams' && ((wheel.teamCount ?? 0) < 2 || (wheel.teamCount ?? 0) > active.length || active.some((entry) => entry.weight !== 1))) {
    return 'INVALID_TEAM_COUNT';
  }
  if (wheel.tool === 'bottle') {
    const seats = wheel.seats ?? [];
    if (seats.length !== activeIds.size || new Set(seats).size !== seats.length || seats.some((id) => !activeIds.has(id)) || activeIds.size < 2 || activeIds.size > 20) {
      return 'INVALID_SEATS';
    }
  }
  if ((wheel.tool !== 'weighted' && wheel.entries.some((entry) => entry.weight !== 1)) || (wheel.tool === 'weighted' && wheel.mode === 'shuffled-cycle')) {
    return 'INVALID_WEIGHT_MODE';
  }
  if (wheel.tool !== 'numbers' && active.length === 0) return 'NO_ACTIVE_ENTRIES';
  return 'OK';
}
