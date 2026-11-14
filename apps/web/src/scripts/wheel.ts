import { uniformIndex, browserRandomSource } from '@lavbe/selection';
import { limits } from '../data/config';
import messages from '../../../../content/locales/az.json';
import { loadWheelDraft, saveWheelDraft } from '@lavbe/session';

const canvas = document.querySelector<HTMLCanvasElement>('#wheel-canvas');
const input = document.querySelector<HTMLTextAreaElement>('#entries');
const button = document.querySelector<HTMLButtonElement>('#spin');
const result = document.querySelector<HTMLParagraphElement>('#result');
const count = document.querySelector<HTMLElement>('#count');
const reset = document.querySelector<HTMLButtonElement>('#reset');
const storageStatus = document.querySelector<HTMLElement>('#storage-status');
if (!canvas || !input || !button || !result || !count || !reset || !storageStatus) throw new Error('Wheel interface is incomplete');
const wheelCanvas: HTMLCanvasElement = canvas;
const entriesInput: HTMLTextAreaElement = input;
const spinButton: HTMLButtonElement = button;
const resultMessage: HTMLParagraphElement = result;
const participantCount: HTMLElement = count;
const resetButton: HTMLButtonElement = reset;
const saveStatus: HTMLElement = storageStatus;
const ctx = wheelCanvas.getContext('2d');
if (!ctx) throw new Error('Canvas is unavailable');
const context: CanvasRenderingContext2D = ctx;
const palette = ['#9a7bea','#ffc76a','#66c9b2','#f58b8d','#7ca9e8','#ed9cc5','#8dce79','#f0a467'];
let names: string[] = [];
let angle = 0;
let storageReady = false;
let initializationComplete = false;
let editedBeforeRestore = false;
let pendingWrite = Promise.resolve();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function draw(rotation = angle): void {
  const size = wheelCanvas.width, center = size / 2, radius = center - 7;
  context.clearRect(0, 0, size, size);
  names.forEach((name, i) => {
    const arc = Math.PI * 2 / names.length, start = rotation + i * arc - Math.PI / 2;
    context.beginPath(); context.moveTo(center, center); context.arc(center, center, radius, start, start + arc); context.closePath();
    context.fillStyle = palette[i % palette.length]!; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 5; context.stroke();
    context.save(); context.translate(center, center); context.rotate(start + arc / 2); context.textAlign = 'right'; context.textBaseline = 'middle';
    context.fillStyle = '#fff'; context.font = '700 25px ui-sans-serif, system-ui';
    const label = name.length > 18 ? `${name.slice(0, 17)}…` : name; context.fillText(label, radius - 27, 0); context.restore();
  });
  context.beginPath(); context.arc(center, center, radius, 0, Math.PI * 2); context.strokeStyle = 'rgba(48,35,75,.12)'; context.lineWidth = 2; context.stroke();
}
function sync(persist = true): void {
  names = entriesInput.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).slice(0, limits.entries.max);
  participantCount.textContent = messages.messages.participantCount.replace('{count}', String(names.length));
  draw(); spinButton.disabled = names.length === 0 || !initializationComplete;
  if (storageReady && persist) {
    const text = entriesInput.value;
    saveStatus.textContent = messages.messages.storageSaving;
    pendingWrite = pendingWrite.catch(() => undefined).then(() => saveWheelDraft(text)).then(() => {
      if (entriesInput.value === text) saveStatus.textContent = messages.messages.savedLocally;
    }).catch(() => {
      if (entriesInput.value === text) saveStatus.textContent = messages.messages.storageFailed;
    });
  }
}
sync();
saveStatus.textContent = messages.messages.storageLoading;
resultMessage.textContent = messages.messages.resultIdle;
entriesInput.addEventListener('input', () => { editedBeforeRestore = true; sync(); });
resetButton.addEventListener('click', () => { entriesInput.value = 'Aylin\nMurad\nLeyla\nKamran'; editedBeforeRestore = true; sync(); });
void loadWheelDraft().then((saved) => {
  if (!editedBeforeRestore && saved !== null) entriesInput.value = saved;
  storageReady = true;
  initializationComplete = true;
  sync(false);
  saveStatus.textContent = saved === null ? messages.messages.storageReady : messages.messages.savedLocally;
  if (editedBeforeRestore) sync();
}).catch(() => {
  storageReady = false;
  initializationComplete = true;
  sync(false);
  saveStatus.textContent = messages.messages.storageFailed;
});
spinButton.addEventListener('click', () => {
  if (!names.length || spinButton.disabled) return;
  const roundEntries = [...names];
  const winner = uniformIndex(roundEntries.length, browserRandomSource());
  const selectedName = roundEntries[winner]!;
  spinButton.disabled = true; resultMessage.textContent = messages.messages.resultSpinning;
  entriesInput.disabled = true;
  resetButton.disabled = true;
  const slice = Math.PI * 2 / names.length;
  const target = (Math.PI * 2 * 6) + (Math.PI * 2 - (winner + .5) * slice);
  const start = angle, started = performance.now(), duration = reducedMotion ? 80 : 2600;
  function frame(now: number): void {
    const progress = Math.min(1, (now - started) / duration), eased = 1 - Math.pow(1 - progress, 4);
    angle = start + target * eased; draw();
    if (progress < 1) requestAnimationFrame(frame);
    else {
      angle %= Math.PI * 2; draw();
      resultMessage.textContent = messages.messages.resultWinner.replace('{name}', selectedName);
      entriesInput.disabled = false; resetButton.disabled = false; spinButton.disabled = names.length === 0;
    }
  }
  requestAnimationFrame(frame);
});
