# Wocult Intelligence 15.25 — Light visual refinement

Production before this release: **15.24**. New synchronized visible version and asset cache version: **15.25**.

## Reference and findings

Inspected the supplied `prototype.png`, `Screenshot 2day theme.png`, rendered `Fix — Dark theme done right.pdf`, and the extracted `Fix — Dark theme done right-html.zip`. The earlier Dark comparison screenshot was also available from the preceding release inspection. The prototype controls Light appearance; Dark supplies shared geometry. Reference files were read only.

The previous Light stylesheet retained different sidebar width, card radius, spacing and typography from Dark. Dark-only selectors also hid the existing section labels and card actions in Light. Legacy font inheritance and isolated neutral colors made screens inconsistent. This release promotes that established geometry to common component rules and supplies deliberate Light color tokens.

## Typography and components

Existing self-hosted **Wocult Sora** now supplies UI and page headings in both themes. **Wocult Merriweather** remains in the compact brand lockup. No fonts or dependencies were added. The raster prototype does not identify its exact font; Sora is the closest existing application family used for its sans-serif direction.

| Role | Shared token/value |
| --- | --- |
| Page heading | `--text-page-title`: 28px, 700, line-height 1.2, tracking -.3px; 23px below 800px |
| Supporting line | `--text-subtitle`: 14.5px, line-height 1.55, 8px top margin |
| Section heading | `--text-section-title`: 14px |
| Section label | `--text-section-label`: 12px, 700, uppercase, `--tracking-section-label`: .8px |
| Card title | `--text-card-title`: 14.5px, 600 |
| Description/action | `--text-small`: 12.5px; description line-height 1.5, action weight 600 |
| Form/body text | `--text-body`: 14px, line-height 1.5 |
| Navigation | `--text-nav`: 13.5px, 500; active 600 |
| Metadata | `--text-meta`: 11.5px |
| Profile/version | `--text-profile`: 12px; `--text-version`: 10.5px |

Shared `--font-ui`, `--font-heading`, `--font-brand`, line-height and tracking tokens replace divergent theme typography. Light gains the approved 260px sidebar, 64px utility row, 36/40/32px desktop content padding, 14px card radius, 20px card padding and 18px grid gap. Icon chips share 38px size, 10px radius and 18px outline icons. Responsive rules are common to both themes.

## Light appearance

| Token | Value |
| --- | --- |
| Workspace `--app-bg` | `#F6F7F8` |
| Card `--app-surface` | `#FFFFFF` |
| Secondary/hover surfaces | `#F0F3F5` / `#F5F7F9` |
| Utility bar | `#FBFCFD` |
| Border/strong border | `#E2E6EA` / `#BCC5CF` |
| Text/muted/description/meta | `#18212D` / `#566271` / `#5F6B7A` / `#687484` |
| Sidebar | `#182129` |
| Sidebar text/muted/meta | `#F5F3EE` / `#C2CAD3` / `#A8B2BE` |
| Active navigation | `rgba(255,197,0,.12)` with `#FFE28A` text |
| Accent/chip background | `#FFC500` / `rgba(255,197,0,.12)` |
| Small icon/action accent and focus | `#8A6500` for contrast on Light surfaces |
| Utility control text/border/background | `#202733` / `#CFD5DE` / white |
| Card shadow | `0 1px 2px rgba(20,31,45,.03), 0 3px 10px rgba(20,31,45,.025)` |

The sidebar remains dark with unchanged navigation order, role visibility and bottom Logout. Utility controls have explicit neutral contrast, hover and keyboard focus; the left side stays empty apart from the existing mobile drawer control. No title, Search, Home, email or Logout was added to the utility bar.

Cards have subtle elevation and consistent title/description/action hierarchy. Application anchors use application text and deliberate hover colors, preventing browser-blue inheritance. Existing Draft groups and tool actions are visible in both themes; tools and labels are unchanged. Home retains Needs attention as the primary block, separate metadata, aligned chevrons, compact empty states and its existing data sources. Shared neutral tokens refine Upcoming and Recent activity without changing their render/data logic.

Forms, tables, badges and deeper workspace surfaces share typography and theme colors. Inputs/buttons use the common 40px control height, focus, disabled, invalid and busy styling. Checkbox/radio semantics and existing behavior remain intact.

## Dark and shell protection

Dark workspace `#1C1C1F`, sidebar `#141416`, cards `#232326`, yellow `#FFC500`, translucent borders/navigation/chips and shadow remain unchanged. Intentional compatible shared corrections: page headings use Sora instead of Merriweather, form typography/control sizing is standardized, and common badge rounding is shared. Dark is not claimed to be pixel-identical to 15.24.

The existing dedicated 64px utility-bar grid row and independently scrolling workspace remain intact. `--app-topbar-height` continues to own row height. No per-page top-padding workaround, duplicate heading DOM or route code was introduced. Desktop sidebar/topbar stability, mobile drawer focus/Escape/backdrop behavior, theme persistence, one primary heading and no horizontal/double-page scrolling are regression checked.

## Contracts and validation

Runtime JavaScript changed only for the version string. Inline browser scripts are unchanged after line-ending normalization. No backend, business logic, routing, authentication, authorization, invitation, Firestore query/data, API, Worker or Firebase configuration changed.

Validation:

- `npm.cmd run syntax`, additional frontend/QA script syntax checks, and inline browser-script parse: pass.
- `npm.cmd test`: **264 passed**, zero failures/skips.
- Focused shell, typography and Podcast Prep tests: **61 passed**.
- Firestore/Storage demo-project emulator suite: **15 passed**; no production writes or deployment.
- Browser shell suite: all eight staff sections in both themes at 1920, 1440, 900 and 390px; deeper URL screen; all three guest shells; populated Home fixtures; drawer, focus, scrolling, theme persistence and Admin visibility.
- Computed Light/Dark geometry and typography snapshots are equal at all four widths.
- `git diff --check`: pass.

Visual comparison completed: **yes**, including prototype, Light/Dark Draft, Home, all staff section launchers, deeper form and Podcast Prep guest shell. Remaining deliberate differences: real application tools/data replace prototype placeholders; approved existing brand lockup remains; existing Sora is used rather than asserting an unverified raster font match. Legacy deep workflow layouts are preserved.

Browser QA uses the actual application assets with isolated role/data fixtures and blocked backend requests. It verifies rendering and shell interactions, not live authenticated production workflows or production data operations. Downloaded deployed assets are also checked and rendered after deployment; final deployment SHA/status is recorded in the release response.

## Files and release safety

- `app-ui.css`: shared typography/geometry, Light tokens, component states.
- `app-ui.js`, `index.html`: synchronized version/cache references only.
- `scripts/verify-app-shell.mjs`: expanded read-only browser regression coverage.
- `worker/test/appTypography.test.js`: new shared typography/Light contract tests.
- `worker/test/appShell.test.js`: shared icon-token and version expectations.
- `worker/test/adminCanvaTemplateSettings.test.js`, `worker/test/dashboardNewsBriefSubmission.test.js`, `worker/test/podcastPrepClient.test.js`: synchronized version expectations only.
- `RELEASE-15.25.md`: this report.

Release is one normal commit to main followed by existing GitHub Pages deployment. **Worker redeployed: no. Firebase redeployed: no.** Rollback uses a normal revert of this release, with the next unused visible version and standard validation/Pages deployment; never rewrite main history or reuse 15.24/15.25.
