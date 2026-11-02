# v15.34 — Blog Comments permissions

Production version before release: v15.33 (downloaded from intelligence.wocult.com).

Cause: the existing collectionGroup('submissions').get() query lacks an explicit recursive collection-group allow rule. The generic top-level catch-all cannot authorize that query. The loader originated in commit 55c0a8d and remains unchanged.

Repository-wide search found no other feature using the exact submissions subcollection. unsent_submissions is a separate top-level collection; interview submissions use other paths.

Rules changes:
- Add /{path=**}/submissions/{submissionId}, allowing reads only through the existing isWocultStaff() allowlist.
- Add /comments/{postSlug}/submissions/{submissionId}: public creation requires a nonempty string name and message/comment/text, with an optional string pageUrl. Timestamp aliases and additional historical fields remain unrestricted for compatibility. Staff reads, updates and deletes remain allowed, without validating historical document shape.
- Exclude comments from the broad catch-all so it cannot override the scoped restrictions. Public direct reads, edits and deletes are intentionally blocked as requested.

Impact: Blog Comments collection-group reads, public website creation and staff moderation. No loader, path, authentication, storage, Worker, Webflow, secret or infrastructure changes. No existing comment records written, deleted or migrated. Existing Idea board, Podcast Prep and Guest Writer rules are unchanged.

Validation:
- npm.cmd run syntax: passed.
- npm.cmd test: 317 passed; emulator module requires the separate emulator run.
- Full Firestore/Storage emulator suite: 32 passed, 0 failed, 0 skipped. Covers all three staff accounts, anonymous/non-staff group and direct read denial, current form and legacy create aliases, malformed creates, staff legacy edits/deletion, and existing Idea board, Podcast Prep, Guest Writer and Canva contracts.
- git diff --check: passed.
- No separate lint, build, type-check or formatting scripts are configured.
- Firestore-only deployment to wocult-tasks: successful.
- Staff browser verification blocked by computer-use app approval timeout. Historical live comment count, live search/sort and moderation are not verified. Existing production comments must not be changed for testing.

Changed files: firestore.rules; index.html (visible version only); worker/test/firestoreRulesEmulator.test.js; scripts/verify-guest-profile-dates.mjs and five version-assertion test files (adminCanvaTemplateSettings, appShell, dashboardNewsBriefSubmission, guestWriterProfileDates, podcastPrepClient); this release note.

Rollback: revert the release commit normally and push to main to restore the frontend. For a rules-only rollback, deploy a reviewed prior rules file with --only firestore:rules. The prior file restores the original collection-group failure and broad public comment access, so prefer a forward correction retaining the scoped access protections. No data rollback is needed.
