# 📲 PWA and offline behavior

## Installation and capabilities

HTTPS, web manifest, proper start_url/scope, standalone display, theme/background colors and first-party icons are required. Export regular 192/512 PNG, maskable 192/512 PNG with safe zone, apple-touch 180 PNG and favicon SVG/ICO. Documentation banner/icons are not substitutes. Native installation UX varies; Android install prompt is optional and iOS needs contextual share/add-to-home instructions. Do not promise browser-unsupported install/fullscreen/share/haptic behavior.

## Offline matrix

| Feature | Offline behavior |
|---|---|
| Previously opened selection tools | Fully functional with cached core shell and catalog |
| Saved local wheels and reports | Read/write via IndexedDB, export available |
| Downloaded versioned game packs | Playable with retained cards/settings |
| New language or unopened pack | Explain unavailable; offer cached alternatives |
| New share creation or revocation | Disabled with clear retry after reconnect; no silent queued personal upload |
| Existing shared URL | Requires network; not auto-cached |
| Ads, analytics, consent providers | No cached responses, no offline analytics queue |

If recipient explicitly saves a shared wheel locally, clarify that it becomes a local copy and origin revocation cannot remove it.

## Cache rules

Precache minimum public shell, critical scripts and current locale. Hashed immutable same-origin assets: cache-first with bounded entries. Public HTML/catalogs: network-first with version-matched offline fallback. Fonts and sounds: demand-cached with size/age caps. API, /s/, /admin/, /preview/, third-party tags and token-bearing traffic bypass SW cache and CDN. No generic catch-all that serves index.html for private/API paths. Use no-store at origin as defense in depth, not as a replacement for SW exclusion.

Cap managed asset cache at 30 MiB where feasible; remove least recently used optional packs before core assets. IndexedDB user data is never evicted by application cache cleanup. Handle browser quota denial/eviction honestly. User can see downloaded packs, remove optional downloads and export local data. Never download 110 locales automatically.

## Update protocol

Install a versioned worker in waiting state. No unconditional skipWaiting/clients.claim that reloads an active spin or card. Save active session, show an update prompt at a safe boundary, then activate on agreement. Multiple tabs coordinate update readiness; a busy tab delays reload. Old and new assets coexist for at least two releases. Database migrations are forward-compatible and export/backup-aware; never force a destructive downgrade.

Test cold/first visit offline, warm offline, partial cache, corrupt cache, lost network mid-spin, worker update during active game and old-client/new-server compatibility. PWA availability does not guarantee permanent browser storage or native-app parity.
