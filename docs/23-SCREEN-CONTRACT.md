# Visual implementation contract

Status: implementation baseline selected by specification author; owner approval and runtime verification remain pending. Boards are layout references, not finished application screenshots. Do not claim user approval.

| Viewport | Layout |
|---|---|
| 390×844 mobile | 16 px gutters; 56 px header; 44 px tool strip; square board width 358 px; 48 px spin control; editor/results/settings tabs; inline ads below all primary controls |
| 768×1024 tablet portrait | 24 px gutters; board max 560 px centered; panels below; results always accessible |
| 1024×768 tablet landscape | 24 px gutters; 58/42 board/editor split; no overlapping rail ads; report full width below |
| 1440×1000 desktop | content max 1280 px; 56/44 board/editor grid; optional ad rail only if 280 px clear width remains; reports below |

Header: wordmark, tool/play/library navigation, language, theme. Mobile navigation collapses to labeled menu; theme and language remain reachable. Board never shrinks to accommodate advertising. Mobile keyboard editing scrolls focused input into view without auto-spinning. Orientation changes preserve geometry/state and defer redraw target changes until a spin ends.

Required views: classic ready/spinning/result; bottle seating/playing/result; game setup/card/paused/exhausted; reports empty/history/statistics; share disclosure/creating/success/unavailable. Every view includes loading/invalid/offline/quota/denied-consent variants where relevant. Classic: crisp violet; bottle: teal tabletop with explicit seat markers; couples: warm rose; friends: amber; education: calm blue. Use config/design-tokens.json, not separate ad-hoc palettes.

## Result/report composition

Result appears in a non-layout-shifting panel under board; optional focused dialog in game mode restores focus on close. Primary action: continue; secondary: remove winner where mode allows. Report tabs below show 50-row pagination. Active round selected by default. Counts/observed share/next chance have separate labels. No count-based automatic chance correction.

## Share dialog

Title, names disclosure, TTL selector, create button; success view URL/copy/native share, expiry and separate management-key export warning. No management key in public QR/URL. Closing dialog never deletes the local wheel.

## Screen evidence matrix

Generate screenshots at all four sizes, both themes and each tool style, plus RTL Arabic and long German labels. Reference contact sheet: docs/assets/screen-layouts.svg. Implement a real interactive vertical slice before expanding all tools; internal slice is not a public MVP. Review against geometry, readability, keyboard, reduced motion and budgets. Record owner approval separately from engineering acceptance.
