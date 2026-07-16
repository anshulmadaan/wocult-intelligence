import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadDashboardHarness(overrides = {}) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('var automatedNewsBriefFilter');
  const end = html.indexOf('function sendAutomatedNewsBriefTestEmail', start);
  assert.ok(start > 0 && end > start, 'Automated News Brief progress block must be present');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', value: '', disabled: false, style: {} });
    return elements.get(id);
  }
  const requests = [];
  let intervalId = 0;
  const context = {
    document: { getElementById: element },
    window: {
      console: { debug() {} },
      location: { search: '' },
      localStorage: { getItem() { return ''; } },
      crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
    },
    console: { debug() {}, warn() {}, error() {} },
    setInterval(fn) { context.lastInterval = fn; return ++intervalId; },
    clearInterval() {},
    escapeHtml,
    escapeAttr: escapeHtml,
    loadAutomatedNewsBriefActivity() {},
    loadAutomatedNewsBriefs: async () => {
      context.loadCount += 1;
      return [];
    },
    workerFetch: async (path, options = {}) => {
      requests.push({ path, options });
      if (overrides.workerFetch) return overrides.workerFetch(path, options, requests);
      if (path.startsWith('/automation/news-briefs/status?runId=')) {
        return { ok: true, json: async () => ({ ok: true, run: activeRun() }) };
      }
      if (path === '/automation/news-briefs/status') {
        return { ok: true, json: async () => ({ ok: true, activeRun: null, latestCompletedRun: null, latestRuns: [] }) };
      }
      if (path === '/automation/news-briefs/run') {
        return { ok: true, json: async () => ({ ok: true, summary: completedRun() }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    },
    currentUser: { email: 'staff@example.com', getIdToken: async () => 'firebase-token' },
    db: null,
    requests,
    loadCount: 0,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  context.loadAutomatedNewsBriefs = async () => {
    context.loadCount += 1;
    return [];
  };
  context.loadAutomatedNewsBriefActivity = () => {};
  return { ctx: context, elements, requests };
}

function activeRun(overrides = {}) {
  return {
    runId: 'run_07070707070707070707070707070707',
    state: 'running',
    phase: 'qualifying',
    startTime: '2026-07-16T05:00:00.000Z',
    targetItems: 5,
    completedItems: 2,
    percentComplete: 40,
    currentHeadline: 'Newest story first',
    dryRun: true,
    ...overrides,
  };
}

function completedRun(overrides = {}) {
  return {
    ...activeRun({
      state: 'completed',
      phase: 'completed',
      completedItems: 5,
      percentComplete: 100,
      endTime: '2026-07-16T05:04:00.000Z',
      itemsReceived: 10,
      itemsSkipped: 5,
      itemsRejected: 2,
      itemsNeedingEditorialCheck: 1,
      itemsVerified: 2,
      draftsGenerated: 0,
      failures: 1,
      webflowItemsChecked: 123,
      itemsAlreadyPublishedOnWocult: 2,
      itemsAlreadyInWebflowDraft: 1,
      itemsPossibleWocultDuplicates: 1,
      itemsSkippedBeforeClaude: 4,
      candidatesEligibleForClaude: 5,
      attemptedItems: Array.from({ length: 5 }, (_, index) => ({
        candidateId: `candidate_${index + 1}`,
        headline: `Story ${index + 1}`,
        source: 'News Tracker',
        dateFound: `2026-07-${16 - index}T04:00:00.000Z`,
        processedAt: '2026-07-16T05:02:00.000Z',
        status: index === 4 ? 'failed' : 'needs_editorial_check',
        outcome: index === 4 ? 'failed' : 'needs_editorial_check',
        primarySourceDiscoveryStatus: index === 0 ? 'found' : 'not_found',
        failureStage: index === 4 ? 'drafting_parse' : '',
        failureCode: index === 4 ? 'drafting_json_invalid' : '',
        failureMessage: index === 4 ? 'Draft JSON was invalid' : '',
      })),
      usage: {
        anthropicCalls: 4,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 12,
        cacheCreationInputTokens: 0,
        webSearchRequests: 3,
        models: ['claude-test'],
      },
      preflightSkippedItems: [
        {
          candidateId: 'nt_published',
          headline: 'Published duplicate <script>',
          source: 'Tracker Source',
          dateFound: '2026-07-16T04:00:00.000Z',
          duplicateStatus: 'already_published_on_wocult',
          duplicateConfidence: 'exact',
          matchReason: 'article_source_url_exact',
          matchedWocultHeadline: 'Existing Wocult story',
          matchedWocultUrl: 'https://www.wocult.com/news/existing-story',
          matchedItemState: 'published',
        },
        {
          candidateId: 'nt_possible',
          headline: 'Possible duplicate story',
          source: 'Tracker Source',
          dateFound: '2026-07-16T03:00:00.000Z',
          duplicateStatus: 'possible_wocult_duplicate',
          duplicateConfidence: 'possible',
          matchReason: 'story_fingerprint_possible',
          matchedWocultHeadline: 'Related Wocult story',
          matchedWocultUrl: '',
          matchedItemState: 'published',
        },
      ],
    }),
    ...overrides,
  };
}

test('dry run disables immediately, sends generated requestRunId and blocks double-clicks', async () => {
  const { ctx, elements, requests } = loadDashboardHarness({
    workerFetch: async (path, options) => {
      if (path.startsWith('/automation/news-briefs/status?runId=')) {
        return { ok: true, json: async () => ({ ok: true, run: activeRun() }) };
      }
      return { ok: true, json: async () => ({ ok: true, summary: completedRun() }) };
    },
  });
  await Promise.all([ctx.runAutomatedNewsBriefDryRun(), ctx.runAutomatedNewsBriefDryRun()]);
  const runRequests = requests.filter((request) => request.path === '/automation/news-briefs/run');
  assert.equal(runRequests.length, 1);
  const body = JSON.parse(runRequests[0].options.body);
  assert.equal(body.triggerType, 'dashboard_dry_run');
  assert.match(body.requestRunId, /^run_[a-f0-9]{32}$/);
  assert.equal(elements.get('automated-news-brief-dry-run-btn').disabled, false);
});

test('active progress resumes after reload and renders determinate percentage', async () => {
  const { ctx, elements } = loadDashboardHarness({
    workerFetch: async (path) => {
      if (path === '/automation/news-briefs/status') {
        return { ok: true, json: async () => ({ ok: true, activeRun: activeRun(), latestCompletedRun: null }) };
      }
      return { ok: true, json: async () => ({ ok: true, run: activeRun() }) };
    },
  });
  await ctx.loadAutomatedNewsBriefStatusAndResume();
  assert.equal(elements.get('automated-news-brief-dry-run-btn').disabled, true);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /40% complete/);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Newest story first/);
});

test('progress is indeterminate before targetItems and failed candidates still advance progress', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.renderAutomatedNewsBriefProgress(activeRun({ targetItems: null, completedItems: 0, percentComplete: null, phase: 'fetching_tracker' }));
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Progress percentage will appear/);
  ctx.renderAutomatedNewsBriefProgress(activeRun({ targetItems: null, completedItems: 0, percentComplete: null, phase: 'checking_wocult_archive' }));
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Checking stories already on Wocult/);
  ctx.renderAutomatedNewsBriefProgress(activeRun({ completedItems: 2, targetItems: 5, percentComplete: 40, phase: 'drafting' }));
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /2 \/ 5 candidates/);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /40% complete/);
});

test('completion reaches 100, reloads candidates and opens Latest run', async () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.handleAutomatedNewsBriefRunStatus(completedRun());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ctx.automatedNewsBriefFilter, 'latest_run');
  assert.equal(ctx.loadCount, 1);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /100% complete/);
  assert.match(elements.get('automated-news-brief-detail').innerHTML, /Latest run/);
});

test('latest run renders five attempted items in newest-first order with token totals', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.automatedNewsBriefLatestRun = completedRun();
  ctx.automatedNewsBriefFilter = 'latest_run';
  ctx.renderAutomatedNewsBriefList();
  const listHtml = elements.get('automated-news-brief-list').innerHTML;
  assert.equal((listHtml.match(/Story /g) || []).length, 5);
  assert.ok(listHtml.indexOf('Story 1') < listHtml.indexOf('Story 5'));
  const detailHtml = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(detailHtml, /Anthropic calls/);
  assert.match(detailHtml, /Input tokens/);
  assert.match(detailHtml, /Web-search requests/);
  assert.match(detailHtml, /claude-test/);
  assert.match(detailHtml, /Webflow News checked/);
  assert.match(detailHtml, /Already published/);
  assert.match(detailHtml, /Webflow drafts/);
  assert.match(detailHtml, /Possible duplicates/);
  assert.match(detailHtml, /Skipped before Claude/);
  assert.match(detailHtml, /Sent to Claude/);
});

test('latest run renders preflight-skipped Wocult duplicate items separately with zero Claude usage', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.automatedNewsBriefLatestRun = completedRun();
  ctx.automatedNewsBriefFilter = 'latest_run';
  ctx.renderAutomatedNewsBriefList();
  const detailHtml = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(detailHtml, /Skipped before AI assessment/);
  assert.match(detailHtml, /Already published on Wocult/);
  assert.match(detailHtml, /Possible existing Wocult story/);
  assert.match(detailHtml, /https:\/\/www\.wocult\.com\/news\/existing-story/);
  assert.match(detailHtml, /No Claude tokens were used for this item/);
  assert.doesNotMatch(detailHtml, /Published duplicate <script>/);
  assert.match(detailHtml, /Published duplicate &lt;script&gt;/);
  assert.match(detailHtml, /Matching Wocult URL unavailable/);
});

test('possible duplicate controls render for possible matches but not confirmed published matches', () => {
  const { ctx } = loadDashboardHarness();
  const possible = ctx.automatedNewsBriefPreflightCardHtml({
    candidateId: 'nt_possible',
    headline: 'Possible duplicate',
    duplicateStatus: 'possible_wocult_duplicate',
    duplicateConfidence: 'possible',
    matchReason: 'story_fingerprint_possible',
    matchedWocultHeadline: 'Related story',
    matchedWocultUrl: 'https://www.wocult.com/news/related',
    matchedItemState: 'published',
  });
  assert.match(possible, /Confirm duplicate/);
  assert.match(possible, /Mark not duplicate/);
  assert.match(possible, /Send for assessment later/);
  const published = ctx.automatedNewsBriefPreflightCardHtml({
    candidateId: 'nt_published',
    headline: 'Published duplicate',
    duplicateStatus: 'already_published_on_wocult',
    duplicateConfidence: 'exact',
    matchReason: 'article_source_url_exact',
    matchedWocultHeadline: 'Existing story',
    matchedWocultUrl: 'https://www.wocult.com/news/existing',
    matchedItemState: 'published',
  });
  assert.doesNotMatch(published, /Confirm duplicate|Mark not duplicate|Send for assessment later/);
});

test('historical missing usage renders safely', () => {
  const { ctx } = loadDashboardHarness();
  assert.match(ctx.automatedNewsBriefUsageHtml(null), /Usage data was not recorded/);
  assert.match(ctx.automatedNewsBriefRunSummaryHtml(completedRun({ usage: null })), /Usage data was not recorded/);
});

test('failed candidate detail shows failure stage and preserves qualification score', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.renderAutomatedNewsBriefDetail({
    id: 'failed_1',
    status: 'drafting_failed',
    normalizedStatus: 'failed',
    originalHeadline: 'Failed story',
    qualificationScore: 82,
    recommendedPriority: 'P1',
    qualificationResult: { qualificationReasons: ['Strong candidate'], materialFacts: ['Fact'] },
    failureStage: 'drafting_parse',
    failureCode: 'drafting_json_invalid',
    failureMessage: 'Draft JSON was invalid',
    failureRunId: 'run_failed',
    lastSuccessfulStage: 'verification',
    retryable: false,
  });
  const html = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(html, /Score 82/);
  assert.match(html, /Failed stage: drafting_parse/);
  assert.match(html, /drafting_json_invalid/);
  assert.doesNotMatch(html, /Retry Webflow submission/);
});

test('candidate detail renders Wocult duplicate language separately from rejected and failed states', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.renderAutomatedNewsBriefDetail({
    id: 'possible_1',
    status: 'needs_editorial_check',
    normalizedStatus: 'needs_editorial_check',
    originalHeadline: 'Possible duplicate candidate',
    duplicateCheck: {
      checked: true,
      status: 'possible_wocult_duplicate',
      confidence: 'possible',
      matchReason: 'story_fingerprint_possible',
      matchedWocultHeadline: 'Related Wocult story',
      matchedWocultUrl: 'https://www.wocult.com/news/related',
      matchedItemState: 'published',
    },
  });
  const html = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(html, /Possible existing Wocult story/);
  assert.match(html, /The system found a likely related Wocult story/);
  assert.match(html, /No Claude tokens were used for this item/);
  assert.doesNotMatch(html, /Rejected items are read-only|Failed items are diagnostic-only/);
});

test('missing candidate dates do not break card rendering', () => {
  const { ctx } = loadDashboardHarness();
  const html = ctx.renderAutomatedNewsBriefCard({ id: 'no_dates', status: 'needs_editorial_check', originalHeadline: 'No dates' });
  assert.match(html, /Date unavailable/);
});
