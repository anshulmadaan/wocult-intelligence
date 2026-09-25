# Wocult Intelligence 15.26 — Trending recency

Production version inspected before editing: **15.25**. Release: **15.26**.

The existing `NEWS_TRACKER_API` in `index.html` is a Google Apps Script deployment with ID `AKfycbx0jptMFVvxkqzxzPLjh0buzWyeILTS_D8gcKWciLVmUhd2AdQ9CIWvfyGYbXcZH-Dx`. Its configured URL and query configuration are unchanged. `loadNewsTracker()` fetches its `items`; `normalizeNewsTrackerCard()` prepares the cards; `setCardsForActiveTab()` hands them to `render()`.

The verified feed timestamp field is **`dateFound`**. Live inspection returned ISO UTC timestamps, for example **`2026-09-25T09:53:00.000Z`**. The endpoint exposes neither spreadsheet ID nor physical column header, and the Apps Script/Sheet source is not in this repository. Those underlying identifiers cannot be independently confirmed; no Sheet configuration was changed or inferred.

Root cause: the loader normalized and sorted every returned record without a recency predicate. The shared card-loading handoff now applies `recentTrendingCards()` only for `newsTracker`, before rendering. Cached activation/filter changes use that same function, so stale cached records are rechecked. Other source tabs bypass it.

The cutoff is **72 hours**, calculated from `Date.now()`. Records at the exact cutoff are included; older records are excluded. The explicit requested `timestamp >= cutoff` predicate is used, including any future-dated feed records. Eligible cards are sorted newest first without changing their identity or data. Existing links, selection, draft-type selection and generation functions are preserved.

Missing, malformed and impossible dates are excluded, with counts-only logging for loaded/eligible/old/invalid records. A missing `dateFound` cannot become recent through a fallback field. No older-record fallback is provided. The existing empty container says: **“No trending stories found in the last 3 days.”**

Timezone-aware ISO timestamps preserve their offsets through epoch conversion. Legacy day-first dates retain local-browser timezone handling and the existing two-digit-year convention; naive ISO datetimes retain native local-browser interpretation. The existing date parser used for priority/heat behavior is unchanged. No lexical date comparison is used.

Changed files:

- `index.html`: recency/parser helper, shared loading handoff, actual timestamp preservation, empty wording, version/cache references.
- `app-ui.js`: version only.
- `worker/test/trendingRecency.test.js`: 13 focused tests, including cutoff boundaries, invalid/missing dates, offset/local parsing, sorting/data identity, load failure, cached expiry, other sources and draft selection.
- `worker/test/appShell.test.js`, `worker/test/adminCanvaTemplateSettings.test.js`, `worker/test/dashboardNewsBriefSubmission.test.js`, `worker/test/podcastPrepClient.test.js`: synchronized version assertions only.
- `RELEASE-15.26.md`: this report.

Validation: **277 tests pass**, including **13 focused recency tests**. Worker syntax checks, inline browser-script parse and `git diff --check` pass. Protected drafting/source functions were compared with the previous commit and are unchanged. The browser regression suite passes for both themes, eight staff sections/four widths, deeper screens, guest shells, focus/drawer/scroll and theme persistence. Browser checks use isolated fixtures, not live authenticated data writes.

No CSS, prompts, CMS publishing, routing, authentication, permissions, Sheet configuration, or other drafting tools changed. Worker automation continues to consume the original unfiltered feed. **Worker changed/deployed: no. Firebase changed/deployed: no.**

Release uses one normal main commit and the existing GitHub Pages deployment. Commit/deployment verification is reported in the final response. Rollback: normal revert with the next unused visible version and validation, without rewriting history or reusing a released version.
