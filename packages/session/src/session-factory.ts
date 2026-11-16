import type { SessionEnvelope, WheelConfig } from '@lavbe/contracts';

export function createLocalWheelSession(labels: string[], now = new Date()): SessionEnvelope {
  if (!labels.length) throw new RangeError('A local session requires at least one participant');
  const id = () => crypto.randomUUID().replaceAll('-', '');
  const wheelId = 'wheel_default_001';
  const revisionId = id();
  const roundId = id();
  const entries = labels.map((label) => ({ id: id(), label: label.normalize('NFC'), weight: 1, active: true }));
  const wheel: WheelConfig = {
    schemaVersion: 1,
    tool: 'names',
    title: 'Lavbe Wheel',
    locale: 'az',
    mode: 'independent',
    entries,
    settings: { theme: 'system', style: 'classic', motion: 'standard', sound: false, spinSeconds: 4 },
  };
  return {
    schemaVersion: 1,
    sessionId: id(),
    wheelId,
    engineVersion: 'selection-v1',
    createdAt: now.toISOString(),
    currentRevisionId: revisionId,
    configRevisions: [{ id: revisionId, wheel }],
    rounds: [{ id: roundId, startedAt: now.toISOString(), reason: 'session-start' }],
    cycle: { number: 1, remainingEntryIds: entries.map((entry) => entry.id), excludedEntryIds: [] },
    results: [],
    game: null,
  };
}
