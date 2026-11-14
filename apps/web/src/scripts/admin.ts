import adminMessages from '../data/admin-messages';
import { canonicalJson } from '@lavbe/contracts';

type AdminSession = { userId: string; role: 'owner' | 'editor' | 'reviewer' | 'publisher'; csrfToken: string; expiresAt: string };
type Version = { id: string; kind: string; locale?: string; state: string; sourceHash: string; revision: number };
type Job = { id: string; state: string; artifactHash: string | null; errorCode: string | null; mode: 'publish' | 'rollback'; rollbackTargetHash: string | null };
type AuditEvent = { id: string; action: string; objectId: string; at: string };
type PublicationState = { active: { jobId: string; artifactHash: string; updatedAt: string } | null; knownGood: Array<{ jobId: string; artifactHash: string; releasedAt: string }> };
type ApiError = { error?: { code?: string }; requestId?: string };

const m = adminMessages;
const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Admin console element missing: ${id}`);
  return element as T;
};
const status = byId<HTMLParagraphElement>('admin-status');
const login = byId<HTMLElement>('admin-login');
const workspace = byId<HTMLElement>('admin-workspace');
const loginForm = byId<HTMLFormElement>('admin-login-form');
const identity = byId<HTMLSpanElement>('admin-identity');
const logout = byId<HTMLButtonElement>('admin-logout');
const versionList = byId<HTMLDivElement>('admin-versions');
const publishList = byId<HTMLDivElement>('admin-publishable');
const jobsList = byId<HTMLDivElement>('admin-jobs');
const credentialPanel = byId<HTMLDivElement>('admin-credential-panel');
const credentialValue = byId<HTMLElement>('admin-credential');
const versions = new Map<string, Version>();
const jobs = new Map<string, Job>();
const selectedVersions = new Set<string>();
let session: AdminSession | null = null;
let nextCursor: string | null = null;
let nextAuditCursor: string | null = null;
let nextJobsCursor: string | null = null;
let publication: PublicationState = { active: null, knownGood: [] };

const errors: Record<string, string> = {
  AUTHENTICATION_REQUIRED: m.loginFailed,
  ACCESS_DENIED: m.requestFailed,
  VALIDATION_ERROR: m.invalidJson,
  REVISION_CONFLICT: m.requestFailed,
  UNSUPPORTED_ORIGIN: m.requestFailed,
  BODY_TOO_LARGE: m.requestFailed,
  NOT_FOUND: m.requestFailed,
  RATE_LIMITED: m.loginFailed,
  SERVICE_UNAVAILABLE: m.requestFailed,
};

function showStatus(text: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  status.textContent = text;
  status.dataset.kind = kind;
}

async function api<T>(path: string, options: RequestInit = {}, mutation = false): Promise<{ data: T; headers: Headers }> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (mutation && session) headers.set('X-CSRF-Token', session.csrfToken);
  const response = await fetch(`/api/admin/v1${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    let payload: ApiError = {};
    try { payload = await response.json() as ApiError; } catch { /* Keep a generic translated error for non-JSON responses. */ }
    const code = payload.error?.code ?? '';
    const error = new Error(errors[code] ?? m.requestFailed);
    Object.assign(error, { status: response.status, code, requestId: payload.requestId });
    throw error;
  }
  const data = response.status === 204 ? undefined : await response.json() as T;
  return { data: data as T, headers: response.headers };
}

function signedIn(value: AdminSession): void {
  session = value;
  login.hidden = true;
  workspace.hidden = false;
  logout.hidden = false;
  identity.hidden = false;
  identity.textContent = `${m.signedInAs}: ${value.userId} · ${m.role}: ${value.role}`;
  byId<HTMLElement>('admin-audit-panel').hidden = value.role !== 'owner';
  byId<HTMLElement>('admin-operations-panel').hidden = value.role !== 'owner';
  showStatus('', 'info');
  void loadVersions(false).catch(reportError);
  void loadAudit().catch(reportError);
  void loadJobs().catch(reportError);
}

function signedOut(): void {
  session = null;
  login.hidden = false;
  workspace.hidden = true;
  logout.hidden = true;
  identity.hidden = true;
  versions.clear();
  jobs.clear();
  selectedVersions.clear();
  versionList.replaceChildren();
  publishList.replaceChildren();
  jobsList.replaceChildren();
}

function createText(tag: keyof HTMLElementTagNameMap, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label: string, action: () => void | Promise<void>): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'admin-button';
  node.textContent = label;
  node.addEventListener('click', () => { void Promise.resolve(action()).catch(reportError); });
  return node;
}

function reportError(error: unknown): void {
  if (error instanceof Error) {
    if ((error as Error & { status?: number }).status === 401) signedOut();
    showStatus(error.message, 'error');
  } else showStatus(m.requestFailed, 'error');
}

function renderVersions(): void {
  versionList.replaceChildren();
  publishList.replaceChildren();
  const canValidate = session?.role === 'owner' || session?.role === 'editor' || session?.role === 'reviewer';
  const canReview = session?.role === 'owner' || session?.role === 'reviewer';
  const canPublish = session?.role === 'owner' || session?.role === 'publisher';
  for (const version of versions.values()) {
    const row = document.createElement('article');
    row.className = 'admin-row';
    row.append(createText('div', version.id));
    row.append(createText('span', version.kind));
    row.append(createText('span', version.state));
    row.append(createText('span', `${m.revision} ${version.revision}`));
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    actions.append(button(m.inspect, () => inspect(version.id)));
    if (canValidate && ['draft', 'validated'].includes(version.state)) actions.append(button(m.validate, () => validateVersion(version)));
    if (canReview && version.state === 'validated') actions.append(button(m.review, () => reviewVersion(version)));
    row.append(actions);
    versionList.append(row);

    if (canPublish && version.state === 'reviewed') {
      const label = document.createElement('label');
      label.className = 'admin-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = version.id;
      input.checked = selectedVersions.has(version.id);
      input.addEventListener('change', () => { if (input.checked) selectedVersions.add(version.id); else selectedVersions.delete(version.id); renderVersions(); });
      label.append(input, createText('span', `${version.kind} · ${version.id} · r${version.revision}`));
      publishList.append(label);
    }
  }
  byId<HTMLElement>('admin-empty').hidden = versions.size > 0;
  byId<HTMLButtonElement>('admin-next').hidden = nextCursor === null;
  byId<HTMLButtonElement>('admin-publish').disabled = selectedVersions.size === 0;
  byId<HTMLElement>('admin-selected-count').textContent = m.selectedSummary.replace('{count}', String(selectedVersions.size));
}

async function loadVersions(append: boolean): Promise<void> {
  if (!session) return;
  showStatus(m.loading);
  const query = append && nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : '';
  const result = await api<Version[]>(`/versions${query}`);
  if (!append) versions.clear();
  for (const version of result.data) versions.set(version.id, version);
  nextCursor = result.headers.get('X-Next-Cursor');
  renderVersions();
  showStatus(`${versions.size} ${m.versions.toLowerCase()}`, 'success');
}

async function inspect(id: string): Promise<void> {
  const { data } = await api<{ version: Version; payload: unknown }>(`/versions/${encodeURIComponent(id)}`);
  let detail = document.getElementById('admin-version-detail');
  if (!detail) {
    detail = document.createElement('section');
    detail.id = 'admin-version-detail';
    detail.className = 'admin-detail';
    byId('versions-heading').parentElement?.parentElement?.append(detail);
  }
  const heading = createText('strong', `${data.version.kind} · ${data.version.locale ?? ''} · r${data.version.revision}`);
  const pre = createText('pre', JSON.stringify(data.payload, null, 2));
  detail.replaceChildren(heading, pre);
  detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function validateVersion(version: Version): Promise<void> {
  const { data } = await api<{ valid: boolean; errors: Array<{ code: string; recordId: string }> }>(`/versions/${encodeURIComponent(version.id)}/validate`, { method: 'POST', body: '{}' }, true);
  showStatus(data.valid ? m.validateOk : `${m.validateFailed} ${data.errors.map((item) => `${item.code}: ${item.recordId}`).slice(0, 8).join(' · ')}`, data.valid ? 'success' : 'error');
  await loadVersions(false);
}

async function reviewVersion(version: Version): Promise<void> {
  const note = window.prompt(m.reviewNote, m.reviewNoteDefault);
  if (note === null) return;
  await api(`/versions/${encodeURIComponent(version.id)}/review`, { method: 'POST', body: JSON.stringify({ expectedRevision: version.revision, note }) }, true);
  showStatus(m.reviewOk, 'success');
  await loadVersions(false);
}

async function importDraft(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  let payload: unknown;
  try { payload = JSON.parse(byId<HTMLTextAreaElement>('admin-import-json').value); }
  catch { showStatus(m.invalidJson, 'error'); return; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { showStatus(m.invalidJson, 'error'); return; }
  const { data } = await api<Version>('/imports', { method: 'POST', body: JSON.stringify(payload) }, true);
  showStatus(`${m.importOk} ${data.id} · r${data.revision}`, 'success');
  await loadVersions(false);
}

async function digest(value: unknown): Promise<string> {
  const canonical = canonicalJson(value as Parameters<typeof canonicalJson>[0]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function issueJob(path: string, payload: unknown, message: string): Promise<void> {
  const { data, headers } = await api<Job>(path, { method: 'POST', body: JSON.stringify(payload) }, true);
  jobs.set(data.id, data);
  renderJobs();
  const credential = headers.get('X-Runner-Credential');
  if (credential) {
    credentialValue.textContent = credential;
    credentialPanel.hidden = false;
    credentialPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  showStatus(message, 'success');
}

async function createPublishJob(): Promise<void> {
  const ids = [...selectedVersions].sort();
  if (ids.length === 0) return;
  const selected = await Promise.all(ids.map(async (id) => {
    const { data } = await api<{ version: Version; payload: unknown }>(`/versions/${encodeURIComponent(id)}`);
    return { id, revision: data.version.revision, payload: data.payload };
  }));
  const manifestHash = await digest(selected);
  await issueJob('/publish-jobs', { versionIds: ids, manifestHash }, m.jobCreated);
}

function renderJobs(): void {
  jobsList.replaceChildren();
  for (const job of jobs.values()) {
    const row = document.createElement('article');
    row.className = 'admin-job';
    const info = document.createElement('div');
    info.append(createText('strong', `${job.mode} · ${job.id}`), createText('small', job.errorCode ?? ''));
    row.append(info, createText('span', job.state), createText('code', job.artifactHash ?? '—'));
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    if (job.state === 'awaiting-promotion' && job.artifactHash) actions.append(button(m.promote, () => issueJob(`/publish-jobs/${job.id}/promote`, { artifactHash: job.artifactHash }, m.promoted)));
    if (publication.active?.jobId === job.id && publication.knownGood.some((item) => item.artifactHash !== publication.active?.artifactHash)) {
      actions.append(button(m.rollback, () => chooseRollback(job.id)));
    }
    row.append(actions);
    jobsList.append(row);
  }
}

async function loadJobs(append = false): Promise<void> {
  const { data: activeState } = await api<PublicationState>('/publication');
  publication = activeState;
  const query = append && nextJobsCursor ? `?cursor=${encodeURIComponent(nextJobsCursor)}` : '';
  const result = await api<Job[]>(`/publish-jobs${query}`);
  if (!append) jobs.clear();
  for (const job of result.data) jobs.set(job.id, job);
  nextJobsCursor = result.headers.get('X-Next-Cursor');
  byId<HTMLButtonElement>('admin-jobs-next').hidden = nextJobsCursor === null;
  for (const item of publication.knownGood) {
    if (!jobs.has(item.jobId)) jobs.set(item.jobId, { id: item.jobId, mode: 'publish', state: 'succeeded', artifactHash: item.artifactHash, errorCode: null, rollbackTargetHash: null });
  }
  renderJobs();
}

async function chooseRollback(currentJobId: string): Promise<void> {
  const available = publication.knownGood.filter((item) => item.artifactHash !== publication.active?.artifactHash);
  if (available.length === 0) return;
  const chosen = window.prompt(`${m.rollbackTarget}\n${available.map((item, index) => `${index + 1}. ${item.releasedAt} · ${item.artifactHash}`).join('\n')}\n${m.rollbackChoice}`);
  const index = Number(chosen) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= available.length) return;
  await issueJob(`/publish-jobs/${encodeURIComponent(currentJobId)}/rollback`, { targetArtifactHash: available[index]!.artifactHash }, m.rolledBack);
}

async function loadAudit(append = false): Promise<void> {
  if (session?.role !== 'owner') return;
  const list = byId<HTMLDivElement>('admin-audit');
  const cursor = append && nextAuditCursor ? `?cursor=${encodeURIComponent(nextAuditCursor)}` : '';
  const { data, headers } = await api<AuditEvent[]>(`/audit${cursor}`);
  if (!append) list.replaceChildren();
  nextAuditCursor = headers.get('X-Next-Cursor');
  byId<HTMLButtonElement>('admin-audit-next').hidden = nextAuditCursor === null;
  if (data.length === 0 && !append) { list.append(createText('p', m.auditEmpty, 'admin-muted')); return; }
  for (const event of data) {
    const row = document.createElement('article');
    row.className = 'admin-job';
    row.append(createText('strong', event.action), createText('code', event.objectId), createText('time', event.at));
    list.append(row);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  try {
    const { data } = await api<AdminSession>('/session', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password'), mfaCode: form.get('mfaCode') }) }, true);
    loginForm.reset();
    signedIn(data);
  } catch (error) { showStatus(error instanceof Error ? error.message : m.loginFailed, 'error'); }
});

logout.addEventListener('click', async () => {
  try { await api<void>('/session', { method: 'DELETE' }, true); signedOut(); showStatus(m.signIn); }
  catch (error) { reportError(error); }
});
byId('admin-refresh').addEventListener('click', () => { void loadVersions(false).catch(reportError); });
byId('admin-next').addEventListener('click', () => { void loadVersions(true).catch(reportError); });
byId<HTMLFormElement>('admin-import-form').addEventListener('submit', (event) => { void importDraft(event).catch(reportError); });
byId<HTMLFormElement>('admin-user-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget as HTMLFormElement);
  const id = String(form.get('id'));
  const payload = { username: form.get('username'), role: form.get('role'), disabled: byId<HTMLInputElement>('admin-user-disabled').checked };
  void api(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }, true)
    .then(() => { showStatus(m.ownerUserUpdated, 'success'); byId<HTMLFormElement>('admin-user-form').reset(); })
    .catch(reportError);
});
byId<HTMLFormElement>('admin-share-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget as HTMLFormElement);
  const id = String(form.get('shareId'));
  const reasonCode = String(form.get('reasonCode'));
  void api(`/shares/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: JSON.stringify({ reasonCode }) }, true)
    .then(() => { showStatus(m.shareRevocationComplete, 'success'); byId<HTMLFormElement>('admin-share-form').reset(); })
    .catch(reportError);
});
byId('admin-publish').addEventListener('click', () => { void createPublishJob().catch(reportError); });
byId('admin-jobs-next').addEventListener('click', () => { void loadJobs(true).catch(reportError); });
byId('admin-copy-credential').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(credentialValue.textContent ?? ''); showStatus(m.jobCreated, 'success'); }
  catch { showStatus(m.requestFailed, 'error'); }
});
byId('admin-dismiss-credential').addEventListener('click', () => { credentialValue.textContent = ''; credentialPanel.hidden = true; });
byId('admin-audit-refresh').addEventListener('click', () => { void loadAudit(false).catch(reportError); });
byId('admin-audit-next').addEventListener('click', () => { void loadAudit(true).catch(reportError); });

void api<AdminSession>('/session').then(({ data }) => signedIn(data)).catch(() => { signedOut(); showStatus('', 'info'); });
window.setInterval(() => { if (session && jobs.size > 0) void loadJobs().catch(reportError); }, 5000);
