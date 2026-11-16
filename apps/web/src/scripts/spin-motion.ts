const accelerationEnd = 0.15;
const travelEnd = 0.65;
const decelerationDuration = 0.35;
const totalArea = accelerationEnd / 2 + (travelEnd - accelerationEnd) + decelerationDuration / 2;

/** Monotonic integrated velocity curve with continuous speed at 15/50/35% phase boundaries. */
export function wheelSpinProgress(progress: number): number {
  const time = Math.max(0, Math.min(1, progress));
  if (time === 0 || time === 1) return time;
  if (time < accelerationEnd) return (time * time / (2 * accelerationEnd)) / totalArea;
  if (time < travelEnd) return (accelerationEnd / 2 + time - accelerationEnd) / totalArea;
  const decelerationTime = time - travelEnd;
  return (accelerationEnd / 2 + travelEnd - accelerationEnd + decelerationTime - decelerationTime ** 2 / (2 * decelerationDuration)) / totalArea;
}
