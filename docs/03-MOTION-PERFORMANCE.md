# ⚡ Motion, text fitting and performance

## Rendering and selection separation

Selection code produces an immutable result and eligible-entry snapshot before animation. Renderer only illustrates it. Use requestAnimationFrame with monotonic elapsed time, never frame-count-dependent selection. Wheel target angle is computed from a chosen point safely inside the winning sector. Retain an angular margin so pointer rendering cannot ambiguously land on a boundary. Bottle uses the same principle with explicit seats. A hidden tab suspends rendering; on return show the already committed outcome without rerolling.

Default spin is 4 s, adjustable 1–10 s. Reduced motion uses a ≤200 ms fade/reveal with no rotation or confetti. Silent/standard/party presets change decorative intensity only. Audio unlocks on user gesture, has mute and bounded gain, and gracefully degrades when unavailable. Haptics are optional progressive enhancement, never required or promised on every browser.

## Adaptive quality

Cap canvas pixel ratio at 2 initially; lower effective resolution/effects on sustained slow frames. Render static wheel layers once per entry/theme/font/size change. Cache text measurements; no DOM measurements in the animation loop. Decorative particles are bounded (maximum 80), short-lived and absent in reduced motion. Pause background effects when the tab is hidden. Do not download every pack, sound or script for the landing screen.

## Text fitting algorithm

1. Wait for the selected locale font; use a safe fallback if loading fails, then remeasure once when ready.
2. Compute usable wedge geometry from angle, radius, hub/pointer padding and text orientation.
3. Measure actual shaped text with the active font; fit width AND height, using bounded binary search between 10 and 24 CSS px.
4. Segment Unicode graphemes before truncation. If minimum size fails, ellipsize with a full-label tap/focus affordance and the complete accessible list.
5. For very dense wheels, switch to reduced label density and explicitly explain that all eligible entries still participate. Never alter probabilities to improve appearance.
6. Recompute on size/orientation/entries/font/locale changes, not while spinning. RTL text is isolated; physical rotation is not mirrored solely by locale.

## Budgets (release targets, not current measurements)

| Metric | Budget / method |
|---|---|
| Core interaction JS | ≤120 KiB gzip per initial tool route, excluding consented third parties |
| Initial route transfer | ≤350 KiB gzip excluding optional ads and later media; locale-specific fonts counted |
| Core Web Vitals | p75 LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 when sufficient real traffic exists |
| Prelaunch performance | Five cold runs, mobile throttling and actual mid-range devices; median and worst reported |
| Animation | 60 FPS target on 60 Hz reference phone; p95 frame gap ≤25 ms in ≥95% sampled visible spins |
| Touch feedback | ≤100 ms visual feedback on reference devices |
| Dense stress | 1,000 entries, 120-grapheme labels; no crash, accurate result and usable full list |

Record device, OS/browser, battery mode, entry count, build, ads/consent state and trace. The frame budget is a product criterion; do not equate it with screen refresh on 120 Hz devices. Test both cold and warm loads, dark theme, fonts, consent granted/denied and live ads. Field CWV is a postlaunch monitored gate; prelaunch has lab evidence, never fabricated field data.
