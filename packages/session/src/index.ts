import type { WheelConfig } from '@lavbe/contracts';
export { loadWheelDraft, saveWheelDraft } from './draft-storage.ts';
export { acquireWriterLease, commitSelectionResult, deleteSession, exportSessionJSON, importSessionJSON, listSessions, loadSession, releaseWriterLease, renewWriterLease, remapImportedSession, saveInitialSession, SessionConflictError, updateSession } from './session-storage.ts';
export { createLocalWheelSession } from './session-factory.ts';
export { normalizeSessionForStorage, recoverUnacknowledgedResult, validateSessionEnvelope } from './session-validation.ts';
export type { SessionValidation, SessionValidationError } from './session-validation.ts';

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
