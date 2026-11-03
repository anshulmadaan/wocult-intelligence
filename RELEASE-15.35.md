# v15.35 - Mobile responsiveness and touch usability

Previous production HTML: v15.34. Its runtime APP_VERSION still said 15.33; both visible and runtime versions and frontend cache keys are now synchronized to 15.35.

## Findings and scope

- Reproduced: the review image file input overflowed a 320px workspace.
- Reproduced with Chromium touch input against the prior committed frontend: a swipe at the article editor's lower boundary did not advance Refine's outer scroll area (outer scrollTop 0). The corrected mobile behavior advances it (51px in the comparison fixture). The previous overscroll containment stopped chaining.
- Refine's fixed toolbar consumes scarce phone/keyboard viewport space. On phones it now lives inside the existing outer Refine scroll region; the article editor still has its own independent scrollbar. Desktop DOM placement is restored at the breakpoint.
- The fixed authenticated body and overflow-hidden boundary were NOT shown to cause a general scroll failure in the tested engines. They remain, with mobile sizing tied to VisualViewport when available and 100dvh otherwise. No wheel/touch preventDefault handlers or scroll-lock state were introduced.
- Existing detail stacking and most table wrappers already worked. Added min-width:0/max-width constraints, focusable labeled table regions and stacked Web Comm search/sort controls; retained all table columns and existing paths/actions.
- Legacy modal vh caps and unconstrained welcome/type panels were risks at reduced heights. Scoped overlays now use dynamic/visual viewport limits and internal scrolling. Notifications and toast receive mobile edge/safe-area constraints.
- The drawer had no breakpoint cleanup. Closing it on breakpoint transitions prevents stale open/focus-trap state; opening focuses the active item. Navigation scrolls independently and profile/logout stay available. No persistent invisible backdrop reproduced after closing in the final tests.
- Removed blanket mobile topbar .btn hiding. Current topbar contains only navigation/theme/notification utilities; existing contextual page actions remain in place.
- Mobile controls use approximately 44px targets, form inputs use 16px text, long content wraps, optional-image inputs are bounded, and selected inline grids collapse. No new color palette or desktop redesign.
- Sticky tracker/table behavior is retained in its existing scroll region. On mobile the notification heading is no longer sticky, preventing a tall heading from covering panel content.

## Screen coverage

The browser matrix mounts 61 states through real frontend renderers with isolated fixture data: Home; drafting/trending/News Brief/Long View/manual paths; Refine/review/social/image chooser; interview creation/review; Podcast dashboard/create/detail/edit/recording states; Guest Writer profiles/stories/onboarding/discussions; tracker/calendar/editor; Web Comm/UNSENT/populated Blog Comments; Admin/Canva; authentication and guest error states; dialogs. Idea board has a separate behavior suite covering empty/loading/errors, create/edit, comments, admin delete and permission-gated navigation. No production writes occur.

Screens with specific responsive treatment: Refine, Blog Comments, UNSENT, social template/options, optional image/review fields, image chooser, calendar source picker, notifications, toast, Idea dialogs and legacy overlay panels. Guest Writer and Podcast retain their existing responsive detail layout with shared containment and input/touch improvements.

## Validation

- Chromium: 1,708 screen/theme/viewport layout checks; no document/workspace horizontal overflow. Same 1,708 checks in WebKit 26.6.
- Dimensions: 320x568, 360x800, 375x667, 390x844, 393x852, 412x915, 430x932, 768x1024, 820x1180, 1024x1366, 1366x768, 1440x900, 1920x1080 and 844x390. Both themes.
- Interaction checks: drawer/backdrop/Escape/navigation/breakpoint recovery, collapsed cards/details, populated table horizontal scrolling, Blog Comments search/sort/edit layout, input focus, resized viewport recovery, constrained dialogs, notifications and portrait-landscape-portrait without reload. Chromium includes actual synthesized touch drags through tables and at the Refine editor boundary.
- Focus/reduced-height checks cover Idea create, Blog Comment edit, editable Podcast/Guest Writer screens, Refine composer/editor and Editorial form. These simulate available-height changes; they are not a physical-device keyboard certification.
- Idea browser suite: eight widths, both themes; create/detail dialogs, resize while focused, ownership and admin actions using in-memory data.
- Refine: 14 existing layout/theme cases, independent editor scrolling, keyboard composer access and workflow exit. Mobile toolbar expectation updated intentionally; desktop header behavior retained.
- Existing shell suite and 85 deep workflow/theme roundtrips pass. Desktop measured component geometry matches the previous frontend at 1440px and 1920px.
- Screenshot inspection includes all nine major staff areas at 390px and representative 360, 430, 768, 1366 and 1920px views, in Light and Dark.
- npm.cmd run syntax; app-ui.js syntax; inline browser-script parse; npm.cmd test (317 pass); full Firestore/Storage emulator suite (32 pass); git diff --check. No separate lint/type-check/build/format scripts are configured.

## Files and contracts

Frontend: app-ui.css, app-ui.js, index.html. Tests: scripts/verify-mobile.mjs (new), verify-app-shell.mjs, verify-idea-board.mjs, verify-refine-scroll.mjs, verify-guest-profile-dates.mjs; worker/test/appShell.test.js, ideaBoard.test.js, adminCanvaTemplateSettings.test.js, dashboardNewsBriefSubmission.test.js, guestWriterProfileDates.test.js, podcastPrepClient.test.js. This release note.

API, data schema, auth, permissions, guest routing, prompts, attribution, automation, calendar semantics, audio logic and backend contracts are unchanged. No existing production records are touched. Firestore deployment: no. Storage deployment: no. Worker deployment: no. Webflow changes: no.

## Limits and rollback

WebKit on Windows is engine coverage, not physical iOS Safari. Android/iOS system keyboards, actual browser address-bar animation, notch/home-indicator hardware and real microphone hardware were not available. Fixtures isolate all network operations; live authenticated production data workflows are not certified by these layout checks. Intentionally wide tables/calendar and workflow steps still scroll horizontally within their regions.

Rollback: revert this release commit normally and push to main to redeploy the previous frontend through Pages. No data or backend rollback is needed.
