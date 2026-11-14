# 🎨 UX, themes and responsive design

## Information architecture

Default screen: immediately usable classic wheel. Navigation: selection tools, play together, my wheels, language, theme. On desktop, wheel and editor are side by side; results are below. Mobile: wheel then tabs for entries/results/settings; no ad between pointer and spin button. Tablet portrait follows touch layout; landscape uses two columns only if controls remain comfortable. Layout is content-driven, with reference widths 320/375/390/768/1024/1440 CSS px and 200% text zoom.

## Screen inventory

| Screen | Required states |
|---|---|
| Tool | Examples, user data, invalid input, ready, spinning, revealing, empty, persistence error |
| Results | Empty, grouped counts, chronological history, round filter, export, reset confirmation |
| Library | Empty, search, rename, duplicate, import, export, storage quota warning |
| Game setup | Pack selection, player names, seating for bottle, equipment/suitability, ready |
| Game | Picking, card, completed/skipped, paused, exhausted, restored |
| Share | Disclosure, TTL, creating, success, copy fallback, management-key warning, failed/offline |
| Shared view | Loading, available, expired/revoked, local-copy notice, network failure |
| Preferences | Locale, theme, sound, motion, consent, clear-local-data and export |
| Admin | Login/MFA, drafts, validation, diff, publish job, rollback and audit |

## Theme rules

Tokens are in [design-tokens.json](../config/design-tokens.json). System preference is default; explicit light/dark persists. A small same-origin initialization script applies theme before paint under the production CSP. No white flash in dark mode. Respect system changes only in system mode. Style classic as crisp and readable, bottle as a restrained tabletop, couples as warm, friends as energetic and education as calm. No sexualized artwork or alcohol-consumption tasks implied by the bottle visual.

Colors are semantic tokens, never participant identity. Every participant retains a stable ID and text label. Dark/light palettes require contrast checks independently. Motion presets do not change chance or game rules.

## Controls and accessibility

Target WCAG 2.2 AA with manual evidence. Product touch targets are at least 44×44 CSS px where practicable; this is a product rule, not a claim that WCAG universally requires 44 px. Keyboard focus must be visible, not covered by ads or overlays. Enter/Space activates focused controls; spin shortcut never fires while typing. Canvas has a semantic list and accessible result region. Announce one committed result politely, not every animation tick. Color/sound are supplementary. Dialogs trap focus appropriately and restore it to the invoker. No swipe-only actions.

Long labels use the fitting rules in [motion](03-MOTION-PERFORMANCE.md). Bidirectional names use isolation; emoji and combining marks must not break. Avoid country flags as language labels. Language picker searches native and localized names.

## Error and destructive behavior

Undo entry changes for the last 20 local edits in a wheel, excluding committed historical results. Reset history, remove a saved wheel and clear local data require descriptive confirmation; offer export. Import previews invalid/duplicate data before applying. Never silently erase a session when changing theme or language.

## Icon system

36 self-contained SVG documentation icons are supplied in [the catalog](assets/ICONS.md). They are original repository assets. Runtime implementation should use a coherent local subset of a vetted icon library, document its license and supply the same action mapping; no external icon CDN. Decorative icons are hidden from assistive technology; icon-only buttons need translated labels and tooltips. The README banner is documentation artwork, not an approved final trademark/logo or a complete PWA app-icon export.

## Visual craft supplements

[Art direction](27-ART-DIRECTION.md), [component/motion contract](28-COMPONENT-MOTION.md) and [design acceptance](29-DESIGN-ACCEPTANCE.md) are mandatory. config/design-craft.json complements semantic tokens. Existing diagrams/documentation icons are not proof of final art direction or owner approval.
