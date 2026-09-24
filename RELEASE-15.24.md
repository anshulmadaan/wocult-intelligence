# Wocult Intelligence 15.24

Production was visibly **15.23** before this work. This frontend release advances the sidebar badge, JavaScript version, stylesheet/script cache keys, and synchronized tests to **15.24**.

## Reference inspection and visual result

All five supplied Drive files were downloaded and inspected: `Fix — Dark theme done right.pdf` (rendered page), `Fix — Dark theme done right-html.zip` (extracted HTML and exact values), `prototype.png`, `Screenshot dark theme.png`, and `Screenshot 2day theme.png`.

The prior Dark implementation combined a legacy cream landing background with pale text, blue-grey surfaces, a gradient sidebar, oversized navigation rows, and mustard accents. Its primary heading was duplicated in the utility bar. The corrected drafting screen was rendered at 1440 × 860 and visually compared with the PDF. The continuous surfaces, compact navigation, typography, card groups, dimensions and hierarchy now follow the reference.

Intentional differences from the PDF follow the task instructions: no utility-bar title or search; theme control retained; Logout stays in the sidebar; existing navigation/tool actions and outline icon identities remain; content scrolls and responds to smaller viewports. The sidebar profile therefore includes an extra Logout row. The desktop scrollbar reserves a small stable gutter. Light retains its previous palette, fonts, card dimensions and layout.

## Centralized Dark tokens

| Purpose | Value |
| --- | --- |
| Workspace / utility bar | `#1C1C1F` |
| Sidebar | `#141416` |
| Card | `#232326` |
| Secondary elevated surface | `#29292D` |
| Accent / focus | `#FFC500` |
| Primary text | `#F5F3EE` |
| Muted / description / meta | `rgba(245,243,238,.55 / .50 / .40)` |
| Sidebar muted text | `rgba(245,243,238,.62)` |
| Border / control border | `rgba(255,255,255,.07 / .08)` |
| Active navigation | `rgba(255,197,0,.14)` |
| Icon chip | `rgba(255,197,0,.13)` |
| Profile background | `rgba(255,255,255,.04)` |
| Avatar | `#4A4A4E` |
| Card shadow | `0 2px 8px rgba(0,0,0,.25)` |

Dark sidebar width is 260px with 28px/18px padding, 17px navigation icons and compact 9px/12px navigation padding. Cards use 14px radii, 20px padding and 18px grid gaps. Icon chips are 38px with 10px radii and 18px yellow outline icons. Card actions have pale text and yellow arrows. Legacy anchors explicitly inherit the application text color, preventing browser blue. Merriweather and Sora are served locally with their OFL licenses and used only in Dark mode.

## Root causes and shell correction

The external theme stylesheet precedes the legacy inline stylesheet. Legacy `.landing` and workflow backgrounds therefore remained cream despite Dark token changes; pale headings on those surfaces appeared ghosted. Dark-specific shared selectors now apply the workspace and elevated-surface tokens with sufficient specificity. The duplicated utility title was an actual `#app-page-title` node updated by `setSection`; both that node and its shell updater were removed. The existing inline business script is unchanged after line-ending normalization.

The 15.23 commit already offset primary fixed workspaces by 64px; the overlap was not reproduced on those primary containers in the baseline check. However, news stats, saved-story controls and the news error banner were direct body children outside the bounded workspace, while the fixed bar had no document-flow row. These elements could occupy the area behind the header. Legacy child landing minimum heights also assumed a 52px header and forced unnecessary overflow.

The authenticated body now uses a viewport-height grid: sidebar column, dedicated utility-bar row, and `minmax(0,1fr)` scrolling workspace row. The sidebar stays fixed, and each existing top-level workspace keeps its ID and show/hide contract. All news controls, stats, saved items and errors now live in the news workspace. The existing Guest Writer New Story action lives in its dashboard. No page-specific compensating top padding was added. `--app-topbar-height:64px` drives the row, bar height, scroll padding and notification-panel offset. Nested landing minimum heights use the available workspace. Reduced motion disables transitions rather than creating tiny transitions on previously static layout properties.

The utility bar has an empty desktop left side and notifications (under the existing visibility rules) plus the theme toggle on the right. Mobile adds the existing menu button. There is no title, Home, Search, email, Logout or page action in the utility bar.

## Impact and validation

Affected presentation paths: all eight staff overviews; deeper staff tools; news stats, refresh, saved stories and fallback errors; Guest Writer, Podcast Prep and Interview guest shells; notification panel; theme persistence; mobile drawer and programmatic workspace scrolling. Existing IDs and action handlers for moved controls are preserved. Authentication, role checks, routes, route priority, pending Podcast Prep session state, queries, recordings, transcripts, submissions and data sources are unchanged.

- `npm.cmd run syntax`; `node --check app-ui.js`; inline browser-script parsing.
- Full `npm.cmd test`: 260 passing tests, including existing authentication, Podcast Prep, Guest Writer, Admin and integration regressions.
- Local Firestore/Storage emulator suite: 15 passing tests against the demo project; no production writes.
- Browser regression runner: `scripts/verify-app-shell.mjs`, using temporary Playwright tooling and installed Chrome. Checks 1920, 1440, 900 and 390px viewports, all eight staff sections, deeper URL/news screens, three guest shells, Podcast Prep welcome/question views, one primary overview heading, exact computed Dark colors, legacy links, Light cards, dedicated bar row, viewport bounds, focus scrolling, drawer focus trap/Escape/backdrop, route/scroll preservation, preference persistence and non-admin navigation.
- Visual inspection of rendered staff overviews, mobile/tablet, Light, and guest surfaces; 1440px Dark drafting comparison with the PDF completed.
- `git diff --check`.

There are no project lint, type-check, build or formatting scripts in `package.json`. Browser checks use isolated fixture identities and block backend requests. They verify the real frontend rendering and handlers without accessing or changing production data; they are not a live authenticated end-to-end recording/submission test. Existing backend and rules tests supply regression coverage for those unchanged contracts.

## Files and release safety

Application files: `app-ui.css`, `app-ui.js`, `index.html`; five local font files and two OFL license files under `assets/fonts/`.

Validation files: `worker/test/appShell.test.js`, `worker/test/adminCanvaTemplateSettings.test.js`, `worker/test/dashboardNewsBriefSubmission.test.js`, `worker/test/podcastPrepClient.test.js`, and `scripts/verify-app-shell.mjs`. This report records the release review.

Deploy through the existing GitHub Pages source (`main`, repository root). Worker redeployment: **no**. Firebase redeployment: **no**. No secrets, services, permissions, production configuration or backend behavior changed.

Rollback: make a normal revert of this release commit, assign the next unused visible release number to the rollback, run the validation gate and push normally to `main`. No infrastructure or data rollback is required. Do not force-push or reset remote history.
