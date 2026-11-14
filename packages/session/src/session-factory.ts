import type { SessionEnvelope, WheelConfig } from '@lavbe/contracts';
import type { LocalizedPack } from '@lavbe/contracts';
import { createGameState } from '@lavbe/selection';
import { browserRandomSource, resetCycle, shuffledBottleCycle, type RandomSource } from '@lavbe/selection';

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

export function createLocalGameSession(labels: string[], pack: LocalizedPack, now = new Date()): SessionEnvelope {
  if (labels.length < pack.minPlayers || labels.length > pack.maxPlayers || labels.some((label) => !label.trim())) {
    throw new RangeError(`A game requires ${pack.minPlayers}..${pack.maxPlayers} named players`);
  }
  const id = () => crypto.randomUUID().replaceAll('-', '');
  const wheelId = id();
  const revisionId = id();
  const roundId = id();
  const entries = labels.map((label) => ({ id: id(), label: label.trim().normalize('NFC'), weight: 1, active: true }));
  const wheel: WheelConfig = {
    schemaVersion: 1,
    tool: 'game',
    title: 'Lavbe Game',
    locale: 'az',
    mode: 'independent',
    entries,
    settings: { theme: 'system', style: 'friends', motion: 'standard', sound: false, spinSeconds: 4 },
    game: { packId: pack.id, packVersion: pack.version },
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
    game: createGameState(pack),
  };
}

export function createLocalBottleSession(
  labels: string[],
  mode: 'independent' | 'remove-winner' | 'shuffled-cycle' = 'independent',
  now = new Date(),
  random: RandomSource = browserRandomSource(),
): SessionEnvelope {
  if (labels.length < 2 || labels.length > 20 || labels.some((label) => !label.trim())) throw new RangeError('Bottle needs 2..20 named participants');
  const id = () => crypto.randomUUID().replaceAll('-', '');
  const wheelId = id();
  const revisionId = id();
  const roundId = id();
  const entries = labels.map((label) => ({ id: id(), label: label.trim().normalize('NFC'), weight: 1, active: true }));
  const wheel: WheelConfig = {
    schemaVersion: 1,
    tool: 'bottle',
    title: 'Lavbe Bottle',
    locale: 'az',
    mode,
    entries,
    seats: entries.map((entry) => entry.id),
    settings: { theme: 'system', style: 'bottle', motion: 'standard', sound: false, spinSeconds: 4 },
  };
  const initial = mode === 'shuffled-cycle' ? shuffledBottleCycle(wheel, random) : resetCycle(entries.map((entry) => entry.id));
  return {
    schemaVersion: 1,
    sessionId: id(),
    wheelId,
    engineVersion: 'selection-v1',
    createdAt: now.toISOString(),
    currentRevisionId: revisionId,
    configRevisions: [{ id: revisionId, wheel }],
    rounds: [{ id: roundId, startedAt: now.toISOString(), reason: 'session-start' }],
    cycle: { number: 1, ...initial },
    results: [],
    game: null,
  };
}
