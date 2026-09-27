# Wocult Intelligence 15.27 — Application-wide themes

Production inspected before editing and rechecked before release: **15.26**. New release: **15.27**.

## Cause and impact

Legacy presentation bypassed the root theme: cream workspace CSS, fixed white inline panels, a separate legacy color palette, hard-coded status colors and unrelated typography. The shell's previous style-substring overrides could not reliably theme dynamic details, auth or guest screens. The workspace's isolated stacking context also trapped nested image dialogs behind the sidebar.

The impact review covered frontend renderers, shared shell, authentication/account states, staff/guest routing, Sheet loading, Worker/Firebase callers, storage/recording and Pages deployment. Only presentation and synchronized versions changed. Existing IDs, handlers, prompts, routes, auth checks, API/data shapes, fallback paths and configuration remain intact. No dependency, secret or infrastructure change.

## Inventory and scope

`scripts/theme-screen-inventory.json` records **36 screen roots and 154 show/render/open/load entry points**, grouped into 16 families:

- Home and all eight staff overviews.
- Trending news; News Brief Brief/Generate/Refine/Review & Submit; saved drafts.
- URL drafting, original stories, manual News Brief/long-view, automated News Briefs.
- Written interview creation, submissions, detail and response review.
- Podcast Prep list, detail, creation/editing, feedback, transcripts and question editing.
- Guest Writer staff profiles, profile detail, story list/detail/review.
- Editorial tracker, calendar and item editor.
- Web Comm, UNSENT and Blog Comments.
- Admin and Canva template settings.
- Sign in, create account, password-reset messaging, account/access errors.
- Podcast guest welcome/questions/talking points, recording/playback, saved answers, submission review, feedback, verification and access errors.
- Guest Writer onboarding, pending status, dashboard, ideas/discussion, editor and review status.
- Interview guest invitation, answers and refined review.
- Shared dialogs, image selection, social workflow, notification surfaces, loading, empty and error states.

No application screen family was deferred. Native browser UI and content artwork are the explicit exceptions below.

## Shared system changes

Existing approved Light/Dark core palettes and geometry remain authoritative. Legacy aliases now resolve to shared semantic tokens at the document root, including before authentication. No separate guest theme preference or DOM system was added. `wocult_ui_theme` remains local-browser storage; first use remains Light.

Expanded tokens: `--app-input-bg`, `--app-input-text`, `--app-input-placeholder`, `--app-accent-hover`, `--app-activity`, `--app-activity-bg`, `--app-backdrop`, `--app-dialog-shadow`, `--text-label`, `--text-control`, `--text-dialog-title`.

| Surface | Light | Dark |
| --- | --- | --- |
| Workspace | `#F6F7F8` | `#1C1C1F` |
| Panel | `#FFFFFF` | `#232326` |
| Nested elevation | `#F0F3F5` | `#29292D` |
| Input token | `#FFFFFF` | `#29292D` |
| Sidebar | `#182129` | `#141416` |
| Primary text | `#18212D` | `#F5F3EE` |
| Accent | `#FFC500` | `#FFC500` |
| Border | `#E2E6EA` | `rgba(255,255,255,.07)` |

**86 fixed panel backgrounds** were extracted into `.app-panel-surface`. All **121 inline style attributes containing literal hex colors** in the pre-release source were migrated to tokens/classes; layout-only inline styles remain. Legacy CSS and dynamic status colors also consume tokens. Six inline grid declarations were replaced by shared detail/filter layout classes. No broad feature-JS rewrite.

- News Brief: continuous workspace, shared panels, readable steps/tabs, forms, source cards, links/actions and review surfaces; generation logic unchanged.
- Podcast staff: selected detail and nested guest-link/feedback sections use layered surfaces; shared question-editor form sizing and responsive split layout.
- Podcast guest: questions, guidance, recorder, level label, saved/feedback/access states inherit the root theme. Canvas colors resolve semantic tokens; its bitmap background stays transparent so a stopped waveform cannot retain a white rectangle after a theme switch. Recording/upload/transcription logic is unchanged.
- Guest Writer and interview guests: root tokens cover onboarding, dashboard, editors, review and account states without adding staff controls.
- Auth: themed functional panels, fields, password toggle, validation and links; existing branded composition retained.
- Forms/buttons: shared typography, surfaces, borders, focus, disabled/loading states, primary/secondary/tertiary/destructive variants. Checkbox/radio dimensions cannot inherit full-width text-input sizing.
- Dialogs: themed backdrops/panels; removal of workspace isolation lets fixed dialogs paint above the sidebar. Existing open/close/focus handlers remain unchanged.
- Tables/lists/statuses: semantic headers, dividers, hover, metadata and status palettes.
- Typography: locally loaded Wocult Sora throughout UI, Wocult Merriweather for existing brand treatment. Shared page/card/body/meta sizes propagate into legacy render strings; no theme-specific type scale.
- Responsive: shared detail/filter layouts stack; Automated News Briefs uses available workspace width rather than viewport width. No per-page header-offset hack.

## Visual and regression evidence

Approved cached references inspected: `prototype.png`, Dark PDF render, extracted Dark HTML ZIP, earlier Light/Dark comparison screenshots. Existing approved overview/shell designs were preserved.

**284/284 full tests pass**, zero failures/skips. `npm.cmd run syntax`, inline browser-script parse, frontend and QA-script syntax, and `git diff --check` pass. Full tests include shell/typography, auth routing, Podcast Prep, Guest Writer, written interview, Admin, News Brief and trending recency regression coverage. Seven added structural theme tests guard root inheritance, inventory completeness, surfaces, controls, dialogs and absence of literal legacy feature colors.

Real Chrome read-only visual fixtures exercised **85 screen/viewport cases**, each Light → Dark → Light. Assertions cover matching geometry/typography/input values, unchanged route, no browser-blue links, no sampled mixed white/cream/black surfaces, no workspace horizontal overflow, visible modal stacking and transparent stopped waveform. Screenshots were visually reviewed, including corrected News Brief, Podcast detail/editor/guest, auth, Canva and image-dialog output. Desktop 1440/1920, tablet 900 and mobile 390 were covered. The separate existing shell browser suite passes all eight sections at four widths, guest shells, scroll boundaries, focus/drawer behavior, persistence and Admin visibility.

Browser QA uses actual frontend assets/renderers with isolated sample role/data fixtures and blocked backend requests. Recorder QA uses synthetic media input. It does **not** claim live authenticated production saves, actual microphone hardware, invitation email delivery, CMS publication or external-service transactions. Existing automated regressions cover those code contracts; no production data was written.

A token comparison against the prior index confirms all non-string JavaScript tokens outside the separately reviewed waveform presentation function are unchanged. The 230 changed JS string literals are presentation markup, colors or associated presentation selectors. No business control flow changed.

Light and Dark results: continuous themed surfaces across audited application families, identical theme geometry/type/state, stable utility bar and workspace scrolling. **No known application-owned mixed-theme surface remains in the audited coverage.**

Intentional exceptions: native alert/confirm/prompt, browser audio/file/date UI (with color-scheme where supported); Google logo and decorative login SVG; actual editorial images, crop/export pixels and Canva preview artwork. These are native UI/content, not application panels. Live service-dependent variants cannot all be exhaustively exercised without production transactions; this is a validation limitation, not a deferred styling family.

## Files and release

- `index.html`: legacy presentation migration, waveform presentation, responsive presentation classes, visible/cache version.
- `app-ui.css`: shared tokens/components and stacking/form corrections.
- `app-ui.js`: version only.
- `scripts/theme-screen-inventory.json`: complete internal family/root/renderer checklist.
- `scripts/verify-deep-themes.mjs`: read-only browser regression/visual audit.
- `worker/test/themePropagation.test.js`: new shared-theme contracts.
- `worker/test/appShell.test.js`: synchronized version and resilient topbar boundary assertion.
- `worker/test/podcastPrepClient.test.js`: semantic waveform colors and version.
- `worker/test/adminCanvaTemplateSettings.test.js`, `worker/test/dashboardNewsBriefSubmission.test.js`: synchronized version.
- `RELEASE-15.27.md`: this report.

One focused commit is released by normal push to main through existing GitHub Pages. The final response records the immutable SHA and deployment result after verification; this document intentionally does not embed its own commit hash.

Worker changed/deployed: **no**. Firebase/rules changed/deployed: **no**. Backend/business logic changed: **no**.

Rollback: revert this single release commit with a normal new commit, increment the visible version for that release under the standing project rule, validate and push normally. No data or infrastructure rollback is required.
