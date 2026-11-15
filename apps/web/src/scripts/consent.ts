import enCatalog from '../../../../content/locales/en.json';
import azCatalog from '../../../../content/locales/az.json';
import { optionalTags } from '../data/integrations';

type Consent = { version: 1; policyFingerprint: string; analytics: boolean; advertising: boolean; savedAt: string };
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Navigator { readonly globalPrivacyControl?: boolean; }
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const m = (document.documentElement.lang === 'en' ? enCatalog : azCatalog).messages;
const STORAGE_KEY = 'lavbe.consent.v1';
const policyFingerprint = JSON.stringify(optionalTags);
const gpcEnabled = navigator.globalPrivacyControl === true;
let choice: Consent | null = readChoice();
let frame: HTMLElement | null = null;
let status: HTMLElement | null = null;
let settings: HTMLElement | null = null;
let analyticsToggle: HTMLInputElement | null = null;
let adsToggle: HTMLInputElement | null = null;
let storageFailed = false;

function readChoice(): Consent | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || record.policyFingerprint !== policyFingerprint || typeof record.analytics !== 'boolean' || typeof record.advertising !== 'boolean' || typeof record.savedAt !== 'string') return null;
    return { version: 1, policyFingerprint, analytics: !gpcEnabled && record.analytics, advertising: !gpcEnabled && record.advertising, savedAt: record.savedAt };
  } catch { storageFailed = true; return null; }
}

function loadOptionalServices(consent: Consent): void {
  if (!optionalTags.enabled) return;
  const analytics = consent.analytics && Boolean(optionalTags.gtmId || optionalTags.ga4Id);
  if (!analytics) return;

  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => window.dataLayer!.push(args);
  window.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  if (analytics && optionalTags.gtmId) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(optionalTags.gtmId)}`);
  } else if (analytics && optionalTags.ga4Id) {
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(optionalTags.ga4Id)}`);
    window.gtag('js', new Date());
    window.gtag('config', optionalTags.ga4Id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  }
}

function loadScript(src: string): void {
  if ([...document.scripts].some((script) => script.src === src)) return;
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.addEventListener('error', () => { if (status) status.textContent = m.consentProviderUnavailable; }, { once: true });
  document.head.append(script);
}

function updateConsentMode(next: Consent): void {
  if (window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: next.analytics ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }
}

function clearControllableIdentifiers(): void {
  for (const name of ['_ga', '_gid', '_gat', '_gcl_au']) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('_ga') || key.startsWith('_gcl_')) localStorage.removeItem(key);
  } catch { /* A privacy choice remains effective in memory when storage is blocked. */ }
}

function saveChoice(analytics: boolean, advertising: boolean): void {
  choice = { version: 1, policyFingerprint, analytics: gpcEnabled ? false : analytics, advertising: gpcEnabled ? false : advertising, savedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); }
  catch { storageFailed = true; }
  if (!choice.analytics && !choice.advertising) clearControllableIdentifiers();
  updateConsentMode(choice);
  loadOptionalServices(choice);
  if (status) status.textContent = storageFailed ? m.consentSessionOnly : m.consentSaved;
  if (frame) frame.hidden = !storageFailed;
  const continueButton = frame?.querySelector<HTMLButtonElement>('.consent-actions button:last-child');
  if (continueButton) continueButton.hidden = !storageFailed;
}

function openPanel(): void {
  if (!frame) return;
  frame.hidden = false;
  settings!.hidden = Boolean(choice);
  if (analyticsToggle) analyticsToggle.checked = Boolean(choice?.analytics && !gpcEnabled);
  if (adsToggle) adsToggle.checked = Boolean(choice?.advertising && !gpcEnabled);
  (frame.querySelector<HTMLButtonElement>('[data-consent-allow]:not(:disabled)') ?? frame.querySelector<HTMLButtonElement>('button'))?.focus();
}

function buildPanel(): void {
  frame = document.createElement('section');
  frame.className = 'consent-panel';
  frame.hidden = Boolean(choice);
  frame.setAttribute('aria-labelledby', 'consent-title');
  frame.setAttribute('role', 'region');
  const heading = document.createElement('h2'); heading.id = 'consent-title'; heading.textContent = m.consentTitle;
  const copy = document.createElement('p'); copy.textContent = m.consentBody;
  status = document.createElement('p'); status.className = 'consent-status'; status.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'consent-actions';
  const continueButton = document.createElement('button'); continueButton.type = 'button'; continueButton.textContent = m.consentContinue; continueButton.hidden = true; continueButton.addEventListener('click', () => { frame!.hidden = true; });
  const allow = document.createElement('button'); allow.type = 'button'; allow.dataset.consentAllow = ''; allow.textContent = m.consentAllowAll;
  const reject = document.createElement('button'); reject.type = 'button'; reject.textContent = m.consentRejectOptional;
  const customize = document.createElement('button'); customize.type = 'button'; customize.textContent = m.consentCustomize;
  allow.addEventListener('click', () => saveChoice(true, true));
  reject.addEventListener('click', () => saveChoice(false, false));
  customize.addEventListener('click', () => { settings!.hidden = !settings!.hidden; if (!settings!.hidden) analyticsToggle!.focus(); });
  actions.append(allow, reject, customize, continueButton);
  settings = document.createElement('div'); settings.className = 'consent-settings'; settings.hidden = true;
  const essential = document.createElement('p'); essential.textContent = m.consentEssentialOnly;
  const analyticsLabel = document.createElement('label'); analyticsToggle = document.createElement('input'); analyticsToggle.type = 'checkbox'; analyticsToggle.disabled = gpcEnabled; analyticsLabel.append(analyticsToggle, document.createTextNode(` ${m.consentAnalytics}`));
  const adsLabel = document.createElement('label'); adsToggle = document.createElement('input'); adsToggle.type = 'checkbox'; adsToggle.disabled = gpcEnabled; adsLabel.append(adsToggle, document.createTextNode(` ${m.consentAdvertising}`));
  const save = document.createElement('button'); save.type = 'button'; save.textContent = m.consentSaveChoices; save.addEventListener('click', () => saveChoice(Boolean(analyticsToggle?.checked), Boolean(adsToggle?.checked)));
  settings.append(essential, analyticsLabel, adsLabel, save);
  if (gpcEnabled) { const gpc = document.createElement('p'); gpc.className = 'consent-gpc'; gpc.textContent = m.consentGpc; settings.append(gpc); allow.disabled = true; }
  const withdrawal = document.createElement('p'); withdrawal.className = 'consent-withdrawal'; withdrawal.textContent = m.consentWithdrawal;
  frame.append(heading, copy, actions, settings, withdrawal, status);
  document.body.prepend(frame);
}

function addFooterControl(): void {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'privacy-choices'; button.textContent = m.consentPrivacyChoices;
  button.addEventListener('click', openPanel);
  footer.append(button);
}

buildPanel();
addFooterControl();
if (choice) loadOptionalServices(choice);
