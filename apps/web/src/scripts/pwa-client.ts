import enCatalog from '../../../../content/locales/en.json';
import azCatalog from '../../../../content/locales/az.json';

const locale = document.documentElement.lang === 'en' ? enCatalog : azCatalog;
const strings = locale.messages;
const workerSupported = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

const tabId = crypto.randomUUID();
const readiness = new Map<string, { busy: boolean; seenAt: number }>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lavbe-pwa-update-readiness');
let localBusy = false;
let waitingWorker: ServiceWorker | null = null;
let prompt: HTMLElement | null = null;
let updateButton: HTMLButtonElement | null = null;
let acceptedUpdate = false;

function isAnyTabBusy(): boolean {
  if (!channel) return true;
  const now = Date.now();
  for (const [id, state] of readiness) if (now - state.seenAt > 5000) readiness.delete(id);
  return localBusy || [...readiness.values()].some((state) => state.busy);
}
function publishReadiness(): void {
  channel?.postMessage({ type: 'STATE', id: tabId, busy: localBusy, at: Date.now() });
  if (waitingWorker) renderUpdatePrompt();
}
function renderUpdatePrompt(): void {
  if (!waitingWorker) return;
  if (!prompt) {
    prompt = document.createElement('section');
    prompt.className = 'pwa-update-prompt';
    prompt.setAttribute('role', 'status');
    prompt.setAttribute('aria-live', 'polite');
    const message = document.createElement('span');
    message.textContent = strings.pwaUpdateAvailable;
    updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.textContent = strings.pwaUpdateNow;
    updateButton.addEventListener('click', () => {
      if (isAnyTabBusy() || !waitingWorker) return;
      acceptedUpdate = true;
      waitingWorker.postMessage({ type: 'LAVBE_ACTIVATE_UPDATE' });
    });
    prompt.append(message, updateButton);
    document.body.append(prompt);
  }
  const busy = isAnyTabBusy();
  updateButton!.disabled = busy;
  updateButton!.setAttribute('aria-describedby', 'pwa-update-status');
  let status = prompt.querySelector<HTMLElement>('#pwa-update-status');
  if (!status) {
    status = document.createElement('span');
    status.id = 'pwa-update-status';
    prompt.append(status);
  }
  status.textContent = busy ? strings.pwaUpdateSafe : '';
}

channel?.addEventListener('message', (event: MessageEvent) => {
  const data = event.data;
  if (data?.type === 'STATE' && typeof data.id === 'string' && data.id !== tabId) {
    readiness.set(data.id, { busy: Boolean(data.busy), seenAt: Date.now() });
    if (waitingWorker) renderUpdatePrompt();
  }
  if (data?.type === 'LEAVING' && typeof data.id === 'string') readiness.delete(data.id);
});
window.addEventListener('lavbe:activity', (event: Event) => {
  localBusy = Boolean((event as CustomEvent<{ busy?: boolean }>).detail?.busy);
  document.documentElement.dataset.pwaBusy = String(localBusy);
  publishReadiness();
});
window.addEventListener('pagehide', () => channel?.postMessage({ type: 'LEAVING', id: tabId }));
setInterval(publishReadiness, 2000);

if (workerSupported && import.meta.env.PROD) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(async (registration) => {
    const inspect = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        renderUpdatePrompt();
      }
    };
    inspect();
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', inspect);
    });
    await registration.update().catch(() => undefined);
    inspect();
  }).catch(() => undefined);
}

navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (acceptedUpdate) location.reload();
});
