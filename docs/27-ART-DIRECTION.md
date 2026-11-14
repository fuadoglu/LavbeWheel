# Lavbe art direction — quiet interface, expressive wheel

## Quality target and status

The owner requests modern, distinctive, Awwwards-level craft. Treat this as an aspiration requiring executed visual evidence, not an award/certification or an adjective that passes review. Existing docs/02 and docs/23 specify usability/layout, not proof of accomplished art direction. This supplement fixes design intent and decision criteria; final high-fidelity screens and working interaction still require review. Do not claim a schematic contact sheet is the final design.

## One concept

The interface is a quiet, precise instrument; the wheel supplies personality, suspense and reward. Visual identity comes from the circle, pointer, sector proportions and controlled motion. Shared actions and surfaces stay familiar across tools. A bottle is a real directional instrument with seats, not a wheel picture replaced by a bottle clipart. Couples/friends packs are warm and playful, not adult-styled.

The distinctive moment is the final approach → exact stop → selected sector illumination → result label reveal. It must remain satisfying without sound and understandable with rotation disabled. Decorative work concentrates on this useful moment instead of competing background effects.

## Composition

Use existing responsive geometry. Wheel is the primary object, editor secondary, reports tertiary. No marketing hero above the working tool, oversized slogan taking the first viewport or forced onboarding. Toolbar is compact with plain-language labels. One clear primary action per screen. On narrow phones content may naturally scroll; do not force everything into one cramped viewport or shrink labels/targets to fit.

Desktop: board has breathing room, editor is one composed surface and report reads as editorial rows rather than a wall of cards. Mobile: keep board/result/spin stable; entries editor is a deliberate sheet/full panel with visible done action. Switching tabs preserves scroll/draft. Tablet is independently reviewed for reach, keyboard and landscape, not a stretched phone or compressed desktop.

## Surfaces and color

Use semantic palettes from config/design-tokens.json. Light feels warm-neutral and crisp, not glaring; dark is ink with gentle separation, not pure black everywhere. Primary violet remains identity; teal/rose/amber/blue are tool accents, never a new unrelated UI system. Sector colors are curated and balanced; text chooses verified dark/light foreground per sector. Arbitrary user colors require an accessible label treatment.

Limit visual depth to surface border + subtle elevation. No global glassmorphism, large blur layers, gratuitous neon, rainbow gradients, simulated dashboard decoration or permanently moving backgrounds. A small radial highlight within the board is allowed if inexpensive and does not reduce label contrast. Dark surfaces/shadows/focus and result celebrations are authored independently rather than CSS inversion.

## Typography

Use one humanist UI sans with clear numerals and multilingual companion families. Final font selection requires license and shaping review; prefer a self-hosted Latin family with a compatible Noto-family fallback for required scripts, not a remotely loaded single font pretending to cover 110 locales. Build only necessary script subsets. Use config/design-craft.json role scale; headings need careful optical spacing, paragraphs comfortable line height and reports tabular numerals. Never uppercase long native-language labels by default. Avoid 10 px UI chrome; the separate wheel-label minimum is a dense-geometry fallback only.

Brand wordmark, favicon and app-icon design are a dedicated deliverable. Existing README art and documentation icons are not the approved product identity. Final assets must work monochrome, at small sizes and in maskable safe areas. No fake optical/ratio science claims.

## Wheel and bottle craft

Classic: slim outer ring, precise pointer, restrained hub, readable sectors. Pointer has a stable physical position and no decorative shadow hiding the boundary. Sector separators are subtle and consistent; selected sector receives a bounded highlight after stop. Hub is not a giant logo obscuring labels.

Bottle: top-down geometric bottle with intentional silhouette, fixed pivot and subtle material/shadow; no heavy 3D engine required. Seat markers have stable IDs/labels, selected seat gets an unmistakable state. No orientation sensor/camera assumptions.

Couples: warmer surface/rose accent and graceful card reveal; friends: amber energy and bounded celebration; education: reduced decoration and clear report. All tools share the same type, spacing, action grammar and navigation.

## Content and product details

Use real localized action language, not developer vocabulary. Loading means actual work; local spins do not need fake loading delays. Empty states explain one next step; errors explain preserved data and recovery. Success is calm and useful. Ads have labeled reserved space matching surface geometry without imitating interface controls. Sponsor branding cannot own the pointer/result or imply a manipulated outcome.

## Explicit prohibitions

No custom cursor for core controls, scroll hijacking, long intro, perpetual parallax, sound before user gesture, mandatory animation before editing, effects that change chance, hover-only discovery, confetti every few seconds, fake awards, stock trophy graphics or layout shifts on winner reveal. No desktop-only spectacle at mobile users' expense.

## Design deliverables before final implementation signoff

High-fidelity classic/bottle/game/report/share/library screens at phone/tablet/desktop widths, both themes; complete component sheet; final wordmark/app-icon exports; representative Arabic/Chinese/long-German screens; motion storyboard and actual interactive prototype. Use original assets with license inventory. Review real screenshots rather than awarding the specification itself a quality score. Internal prototypes are part of production development, not public MVP releases.

## Selected product icon family

[Phosphor icon/effect contract](31-ICONS-EFFECTS.md) fixes the product family and curated local assets. Earlier optional icon-library wording is superseded: documentation icons remain documentation-only. No mixed product icon sets.
