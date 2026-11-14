# Phosphor icon system and effect choreography

## Final library selection

Use Phosphor Icons as the single product UI icon family. MIT license and exact copyright/permission text are vendored in assets/icons/phosphor/LICENSE. Source commit: 2b75f3ad12b420c9504ef05df8d2564a28f8500e from https://github.com/phosphor-icons/core. There are 52 checked-in SVGs: 45 Regular, 4 Fill, 3 Duotone. No icon CDN, icon font, remote script or whole-library runtime download. This selection is a design decision, not an award endorsement.

The prior 36 docs/assets/icons illustrations remain documentation artwork only; do not mix them with Phosphor in product controls. Product logo, Canvas wheel/pointer and tabletop bottle are original artwork, not library icons. The beer-bottle glyph labels the bottle mode only; no alcohol requirement or drinking task is implied.

## Shape and weight rules

Default Regular is used throughout action/navigation controls. Fill only for the four selected states explicitly mapped in config/icon-map.json, while text/aria-pressed also communicate selection. Duotone only for pack-category/empty-state illustration, not intermixed action weights. Do not artificially add stroke-width to filled path artwork; Phosphor's weights are separate authored SVGs. Retain viewBox and optical shape. Use currentColor for theme integration. Do not stretch, rotate familiar semantic icons arbitrarily or use gradients as their default fill.

20 px normal controls, 24 px prominent controls, 16 px secondary metadata only. Minimum hit target remains 44×44 CSS px independent of glyph size. Same optical baseline and icon/text gap (8 px). Stable width prevents reflow when theme/sound/selection changes. Mirror only directional navigation arrows under RTL, not bottle direction, play, clock or physical rotation.

## Accessibility and runtime integration

Wrap decorative SVG with aria-hidden=true and focusable=false; put translated accessible label on the actual semantic button. Icon+text controls never repeat icon name to screen readers. Tooltip helps desktop discovery but never substitutes for touch/keyboard labeling. Provide focus-visible, pressed, disabled and selected states through component wrapper. Errors/success never rely on color or icon alone. Button aria-busy and disabled behavior must match actual work; no fake spinning loaders for local computations.

## Purposeful effects

Hover: color/opacity or ≤1 px translation over 140 ms; no bouncing toolbar. Press: immediate bounded displacement, keep hit area fixed. Copy: check replacement for 1.2 s plus polite status; no intrusive toast needed. Save: subtle confirmation only after persistence succeeds. Theme: stable sun/moon replacement with short opacity crossfade, never rotating whole page. Loading spinner: only while genuine asynchronous work is pending; reduced-motion uses static icon + status text.

Wheel choreography: committed result → acceleration/travel/deceleration → exact stop → selected sector emphasis → full-label reveal. Result reveal 200 ms; optional confetti ≤700 ms, ≤80 particles. Core continue action is available at stop, not after confetti. Calm preset disables particles; party adds energy without changing selected result or total waiting time. Bottle uses physically coherent directional rotation and a restrained selected-seat highlight. Game card reveal uses opacity/≤8 px translation; no simulated 3D flip hiding actionable text. Avoid simultaneous competing animations.

No permanent glow/pulse, scroll hijacking, full-page blur, cursor replacement or background loops. Use CSS transitions/Web Animations for controls, requestAnimationFrame for Canvas; no animation library is mandatory merely for effect. Any new dependency must justify measurable benefit and fit existing budgets. Respect prefers-reduced-motion and explicit mute. Haptics optional only where supported.

## Asset update and evidence

config/icon-assets.json pins origin and files; config/icon-map.json maps semantic action names. Runtime imports only assets actually used on that route; vendoring 52 files does not mean preloading 52. License survives bundling/distribution. Any icon update is a reviewed dependency diff with provenance, license, shape and accessible naming checks. Icon buttons need the same tests as text buttons.

DES-03/04/06 acceptance additionally requires: full icon component gallery in both themes at 16/20/24 px; exact action coverage; keyboard/screen-reader labels; RTL direction tests; mute/reduced-motion/copy/save/loading states; real-device frame traces with ads enabled. Do not claim this documentation proves final visual excellence. Review the executed interface and adjust optical details within the fixed family.
