import type { WheelConfig } from '@lavbe/contracts';
export { loadWheelDraft, saveWheelDraft } from './draft-storage.js';

export interface SelectionResult {
  id: string;
  entryId: string;
  label: string;
  createdAt: string;
}

export interface SessionSnapshot {
  config: WheelConfig;
  results: SelectionResult[];
}
