# Release 15.29 — Refine scrolling

Production before change: 15.28. New visible version: 15.29.

## Root cause and fix

The authenticated shell already reserves the utility bar and uses 100dvh. Body/window scrolling is intentionally disabled. Refine also disables #workflow scrolling, but #step2b used calc(100vh - 52px), ignoring the utility bar and actual wrapping workflow header. #refine-content had no scrolling. At 1366x768, the panel ended at y843.75 and the composer ended at y794: content was clipped by the shell, not an operating-system overlay.

Refine now uses the available shell height as a flex column. Workflow navigation and Refine controls/toolbar occupy nonshrinking rows. #refine-content owns outer vertical scrolling with min-height:0; #chat-article-preview retains independent scrolling and a responsive 220–500px controlled height. Long chat history retains its 126px scroll boundary. The composer is in normal flow instead of bottom-sticky positioning. Existing autosave footer provides bottom spacing. No additional body scrollbar or padding workaround was added. Mobile actions wrap without splitting button labels.

## Scope and contracts

Affected workflows: every story type using the shared Refine step, including generated staff and Guest Writer drafts. Existing step guards, AI handlers, content, toolbar commands, Update/Revert/Review actions and navigation destinations remain unchanged. Brief/Generate/Review retain their existing workspace scrolling. Hidden workflows remain hidden. No themes, backend, authentication, routing, data, Worker or Firebase changes/deployments.

Files: index.html (layout/presentation and version/cache references); app-ui.js (version only); worker/test/refineScroll.test.js (new contracts); scripts/verify-refine-scroll.mjs (browser layout regression); version assertions in worker/test/appShell.test.js, adminCanvaTemplateSettings.test.js, dashboardNewsBriefSubmission.test.js and podcastPrepClient.test.js; this release note.

## Validation

- npm.cmd run syntax and inline browser-script parse passed.
- Complete suite: 301 passed, zero failed/skipped. Includes existing auth, routing, Podcast Prep, Guest Writer, generation/refinement and publishing regressions.
- Focused Refine/shell suite: 19 passed.
- Chrome layout checks: 14 cases across Light/Dark at 1920x1080, 1920x900, 1440x900, 1366x768, 1100x650 (small-window viewport), 820x900 and 390x844.
- Verified outer overflow at short heights, full composer reachability, independent editor scrolling, stable controls, matching theme geometry, keyboard Tab access, workflow exit and no browser-page overflow.
- Existing browser shell audit passed: eight sections/four widths, deeper screens, guest shells, mobile drawer, focus, theme persistence and role visibility.
- Screenshots inspected at short desktop and mobile sizes. Browser testing uses real frontend assets with synthetic long-story/chat fixtures and external requests blocked. No live story was edited and no live AI request was sent. A physical Windows taskbar/nonmaximized browser was not independently exercised; viewport containment was measured in Chrome.
- git diff --check passed.

## Release and rollback

One focused commit to main, followed by Pages version/asset verification. Worker redeployed: no. Firebase redeployed: no. Rollback: revert this release commit normally and publish a new version under the standing version rule; no data migration is needed.
