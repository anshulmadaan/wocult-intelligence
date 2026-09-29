# Wocult Intelligence 15.28 — Contextual Back and Guest Writer status

Production inspected: **15.27**. Release: **15.28**.

## Findings and fixes

**Back navigation:** visible Back/Cancel controls called `backToCards()`, which explicitly called `showAppSection('home')`. No application history was maintained. The new `app-navigation.js` keeps a bounded, in-memory stack of allowlisted application actions, scoped to user, access mode and invitation key. `goBackInApp()` restores the previous valid internal context, with an explicit logical-parent fallback. It cannot navigate to a URL, external history or login. Leaving retains the existing unsaved-change guard; signing out/losing the shell resets history. Existing router priority and auth entry points are unchanged.

Updated Back controls cover URL/trending drafting, manual News Brief and long-view (both now have explicit Back), manual review, scratch/existing drafts, automation, interview lists/details, Podcast list/create/detail, Guest Writer profiles/stories/details, editorial/calendar, Web Comm, Canva/admin, guest dashboards and completed-story return actions. Detail panels restore their containing list/context. Workflow-step, image-picker, recorder-review and interview-response Back actions retain their existing in-workflow behavior and use the same Back styling. The redundant workflow Home button is removed; Home remains available through normal navigation. No browser-history API is used.

**Guest Writer status model:** `idea_under_review`, `idea_needs_work`, `draft`, `changes_requested`, `under_review`, legacy `story_under_review`/`submitted`, `scheduled`, `published`. Approval is `ideaStatus: 'approved'`, with `writingUnlocked: true`; it is not a separate story status. Internal **`draft`** means **Start writing**. Dashboard and staff labels now agree. `changes_requested` remains the existing revision state; review/scheduled/published states remain non-writing states.

The reproduced blocking path was stale client state: staff approval changed the stored story to `draft`, but `viewGuestWriterStory()` routed using the guest dashboard's cached pre-approval record. It never fetched the new approval. Opening now fetches the current article, verifies source/owner and routes from that authoritative record. A shared predicate makes `draft` and `changes_requested` the writable states; a legacy flag cannot make a review state writable. Approval clears an obsolete `locked` value, and the writer-opening path resets old revision presentation. No profile approval, authentication or invitation logic changed.

**Status date:** added `articles/{id}.statusChangedAt`. Initial idea creation sets its first state timestamp. All current Guest Writer status-changing writes (approval, idea feedback, change request, save/submit, publish) use one transaction helper. It reads the latest stored status and writes `serverTimestamp()` only when `oldStatus !== newStatus`. Same-status text/metadata/autosave writes do not touch this field. A stale writer tab cannot overwrite a newer review/approval decision.

The staff story detail shows the timestamp next to Current status, using existing metadata typography and local-browser date/time formatting. For older records, the existing `ideaApprovedAt` is used only for an approved `draft`, and `publishedAt` only for `published`. Other missing/invalid dates say **Status change date unavailable**. Generic `updatedAt`, creation dates and version snapshots are not treated as status-transition history. No general status audit history was found, and no historical dates or production records were backfilled.

## Firestore scope and safety

The deployed rules were read and verified to match the repository baseline before release. That baseline's catch-all allowed arbitrary article writes, so a frontend-only check could not prove writers cannot approve themselves.

The narrow rule change scopes Guest Writer **parent article writes**: staff retain approval/status control; an owner can write an approved draft/revision and submit it for review, but cannot set approval fields, publish, change ownership or turn a reviewed story back into a draft. Initial writer-created records must be unapproved ideas. Status transitions require the server request time; same-status writes cannot alter the status date. Existing post-submit version-number updates remain allowed.

Non-Guest-Writer article behavior, article reads/deletes, discussion/version subcollections, writer profiles, Podcast Prep, interview collections, Storage rules and other configuration paths retain their pre-existing contracts. This is not a general database security overhaul. No Worker API or data migration changed. The rule change was reported before deployment.

Older tabs must reload 15.28 before making a status transition: the new rule rejects transition writes that omit the required exact timestamp. Rejection leaves the stored story unchanged.

## Validation

- `npm.cmd run syntax`: pass.
- Inline browser-script parse and frontend JavaScript syntax checks: pass.
- `npm.cmd test`: **299 passed**, zero failures.
- New navigation/Guest Writer tests: **15 passed** (included above), covering parent/previous Back, direct entry, external rejection, role reset, cancelled leave, new manual Back, exact transition dates, same-status edits, no fabricated legacy date, approval/editability and fresh-record routing.
- Firestore/Storage emulator suite: **21 passed**, including six added Guest Writer security/transition cases and all existing rule/storage tests.
- Actual Chrome navigation/Guest Writer smoke tests: pass. Both ordinary and direct-entry Back; Podcast/Writer detail Back; exact staff date; stale cached idea upgraded to editable draft after fresh approval fetch; preapproval remains blocked.
- Existing shell suite: pass (themes, eight sections/four widths, guests, focus, drawer, scroll, role visibility).
- Existing deep theme suite: **85 Light/Dark/Light roundtrips passed**.
- `git diff --check`: pass.

Browser tests use actual frontend renderers with isolated fixtures and blocked external backend requests. Screenshots were reviewed for approved-draft editing and mobile manual-long Back. No live production story was created/edited, and no invitation, recording, publishing or profile transaction was performed for QA. Emulator tests verify real rule enforcement rather than relying on UI restrictions.

## Files

- `index.html`: contextual Back controls, fresh story reads, shared writable-state predicate, transaction/date helpers, staff metadata, version/cache references.
- `app-navigation.js`: safe role-scoped history, logical fallbacks and detail Back controls.
- `app-ui.css`: shared Back-action styling only.
- `app-ui.js`: visible version only.
- `firestore.rules`: narrow Guest Writer approval/status protection.
- `worker/test/navigationGuestWriter.test.js`: 15 functional/structural regression tests.
- `worker/test/firestoreRulesEmulator.test.js`: six added security/compatibility tests.
- `worker/test/appShell.test.js`, `adminCanvaTemplateSettings.test.js`, `dashboardNewsBriefSubmission.test.js`, `podcastPrepClient.test.js`: synchronized version assertions.
- `scripts/verify-navigation-guest-writer.mjs`: read-only browser smoke tests.
- `scripts/verify-app-shell.mjs`, `scripts/verify-deep-themes.mjs`: serve the new local navigation asset in existing isolated QA.
- `RELEASE-15.28.md`: this report.

## Release and recovery

One focused commit, normal push to main, existing GitHub Pages deployment; final response records the immutable SHA and verified deployment result. Firestore rules are the only Firebase deployment required; Storage is not deployed. Worker changed/deployed: **no**.

Recovery should be a versioned forward fix. If frontend rollback is necessary, preserve the transaction/timestamp compatibility with the new approval rules; blindly restoring 15.27 would make its old status-transition writes fail safely. Restoring the permissive old rules would weaken security and requires separate explicit approval. No production data or infrastructure rollback is needed.
