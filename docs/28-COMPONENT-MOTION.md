# Component and motion contract

## Shared interaction states

Every interactive component implements default, hover where supported, focus-visible, pressed, disabled, busy where meaningful and error/selected where relevant. Disabled is not merely lower opacity: semantics and explanation are required. No hover-only essential action. All icon-only buttons have native accessible labels; touch actions remain at least 44×44 CSS px. Use aria-live for one result/error, not tick sounds.

| Component | Concrete behavior |
|---|---|
| Primary spin | 48 px minimum height, stable width; press translates ≤1 px, immediate state feedback; locks against duplicate commands; no expanding glow |
| Secondary action | Text + icon when ambiguity possible; lower emphasis, same hit-target rules |
| Tool selector | Selected state includes text/border indicator; mobile horizontally scrollable with visible affordance, keyboard reachable |
| Participant editor | One multiline paste input plus explicit advanced rows; line count and validation; done action visible above mobile keyboard |
| Advanced weights | Toggle reveals integer fields and visible explanation; weight mode displayed next to spin |
| Segmented tabs | Stable geometry and focus; selected state not color only; preserve each panel state |
| Result panel | Reserved region; entry ID disambiguation; full name wraps; continue/remove/copy actions by context |
| Report | Tabular numbers, meaningful headings, restrained separators, pagination; mobile label remains legible |
| Game card | Clear player, prompt, complete/skip and pause; skip equally discoverable, no refusal penalty |
| Share dialog | Disclose names, TTL, create; URL/copy and separate management-key guidance; no automatic clipboard access |
| Toast | Nonmodal, concise; never sole place for fatal error or secret recovery; no focus theft |
| Dialog/sheet | Escape/close, focus containment/restore, correct scroll; fullscreen editor can be used with keyboard open |
| Consent | Same visual quality as product; reject as discoverable as accept, no preselected optional categories |

## Motion timeline

Selection/commit precedes animation. Standard default spin lasts 4,000 ms. Piecewise monotonic interpolation covers acceleration (~15%), travel (~50%) and deceleration (~35%); use continuous position AND velocity between phases. This is a rendering design target, not an entropy source or inaccurate physics claim. Compute total turns and interior target angle once, then integrate visual time without frame-dependent winner selection.

At stop: pointer/target agreement is immediately legible; selected sector emphasis starts within 100 ms; result label reveal lasts 160–220 ms, optional bounded particles last ≤700 ms. Do not block continue after physical stop for celebration. No fake bounce into a different sector. Reduced-motion skips rotation/particles and uses ≤200 ms reveal; immediate mode remains an explicit user preference. Quiet/standard/party only change audio/decorative strength.

UI transitions use named durations/easings from config/design-craft.json. Hover/focus changes 100–160 ms; sheet/dialog 180–240 ms; theme transition ≤160 ms only after user-triggered change (initial load has none). Avoid animate-all. Position/opacity transforms preferred; no layout measurement per animation frame. Animation interruption, hidden tabs, orientation changes and expired writer leases preserve result integrity.

## Audio grammar

Mute independent from motion. One restrained tick sample with rate cap; stop/result audio short and bounded gain. Never stack unbounded audio nodes or play overlapping background tracks across tools. First gesture unlock only. No successful interaction depends on audio/haptics. Shared presets cannot override recipient mute/reduced-motion preferences.

## Consistency and verification

All components consume semantic tokens; no one-off radius/shadow/style per page. Maintain storybook-equivalent component gallery (tool choice determined at bootstrap) with localized labels, both themes and all states. Provide screenshot tests for geometry/overflow, manual keyboard/screen-reader review and actual device audio/motion review. Static screenshots cannot prove smoothness. Whole-app consistency and reduced-motion parity are mandatory acceptance gates.
