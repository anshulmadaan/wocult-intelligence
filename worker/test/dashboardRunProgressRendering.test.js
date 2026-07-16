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
        return { ok: true, status: 202, json: async () => ({ accepted: true, runId: activeRun().runId, workflowInstanceId: activeRun().workflowInstanceId, state: 'queued' }) };
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
    workflowInstanceId: 'run_07070707070707070707070707070707',
    workflowState: 'running',
    currentWorkflowStep: 'candidate-2-qualification',
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
      workflowState: 'completed',
      currentWorkflowStep: 'completed',
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
      anthropicCallLog: [
        {
          callId: 'call_1',
          candidateId: 'candidate_1',
          headline: 'Story 1',
          stage: 'qualification',
          status: 'completed',
          attempt: 1,
          inputTokens: 25,
          outputTokens: 10,
          webSearchRequests: 1,
          durationMs: 1200,
          prompt: 'PROMPT_SHOULD_NOT_RENDER',
          rawModelResponse: 'RAW_RESPONSE_SHOULD_NOT_RENDER',
        },
        {
          callId: 'call_2',
          candidateId: 'candidate_2',
          headline: 'Story 2',
          stage: 'primary_source_discovery',
          status: 'started',
          attempt: 1,
          inputTokens: 0,
          outputTokens: 0,
          webSearchRequests: 0,
          durationMs: 0,
          searchResults: 'SEARCH_RESULTS_SHOULD_NOT_RENDER',
        },
        {
          callId: 'call_3',
          candidateId: 'candidate_5',
          headline: 'Story 5',
          stage: 'drafting',
          status: 'failed',
          attempt: 2,
          inputTokens: 75,
          outputTokens: 40,
          webSearchRequests: 2,
          durationMs: 800,
          failureCode: 'anthropic_api_error',
        },
      ],
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
  let statusCalls = 0;
  const { ctx, elements, requests } = loadDashboardHarness({
    workerFetch: async (path, options) => {
      if (path.startsWith('/automation/news-briefs/status?runId=')) {
        statusCalls += 1;
        return { ok: true, json: async () => ({ ok: true, run: statusCalls === 1 ? activeRun() : completedRun() }) };
      }
      if (path === '/automation/news-briefs/status') {
        return { ok: true, json: async () => ({ ok: true, activeRun: null, latestCompletedRun: completedRun() }) };
      }
      if (path === '/automation/news-briefs/run') {
        return { ok: true, status: 202, json: async () => ({ accepted: true, runId: 'run_07070707070707070707070707070707', workflowInstanceId: 'run_07070707070707070707070707070707', state: 'queued' }) };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  await Promise.all([ctx.runAutomatedNewsBriefDryRun(), ctx.runAutomatedNewsBriefDryRun()]);
  await ctx.confirmAutomatedNewsBriefNoActiveLock();
  const runRequests = requests.filter((request) => request.path === '/automation/news-briefs/run');
  assert.equal(runRequests.length, 1);
  const body = JSON.parse(runRequests[0].options.body);
  assert.equal(body.triggerType, 'dashboard_dry_run');
  assert.match(body.requestRunId, /^run_[a-f0-9]{32}$/);
  assert.equal(elements.get('automated-news-brief-dry-run-btn').disabled, false);
});

test('HTTP 202 accepted run starts background polling without waiting for pipeline response', async () => {
  const { ctx, elements, requests } = loadDashboardHarness({
    workerFetch: async (path) => {
      if (path === '/automation/news-briefs/run') {
        return { ok: true, status: 202, json: async () => ({ accepted: true, runId: 'run_accepted_070707070707070707', workflowInstanceId: 'wf_accepted', state: 'queued' }) };
      }
      if (path.startsWith('/automation/news-briefs/status?runId=')) {
        return { ok: true, json: async () => ({ ok: true, run: activeRun({ runId: 'run_accepted_070707070707070707', workflowInstanceId: 'wf_accepted', workflowState: 'queued', currentWorkflowStep: 'initialise-run', targetItems: null, percentComplete: null }) }) };
      }
      return { ok: true, json: async () => ({ ok: true, activeRun: null }) };
    },
  });
  await ctx.runAutomatedNewsBriefDryRun();
  assert.equal(requests.filter((request) => request.path === '/automation/news-briefs/run').length, 1);
  assert.match(elements.get('automated-news-briefs-status').textContent, /Run accepted\. Processing continues in the background/);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Queued/);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Workflow instance: wf_accepted/);
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
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Last update/);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Workflow state: running/);
});

test('elapsed time updates locally while running', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.renderAutomatedNewsBriefProgress(activeRun({
    startTime: new Date(Date.now() - 5000).toISOString(),
    updatedAt: new Date(Date.now() - 4000).toISOString(),
    heartbeatAt: new Date(Date.now() - 4000).toISOString(),
  }));
  const first = elements.get('automated-news-brief-progress').innerHTML;
  assert.match(first, /Elapsed:/);
  assert.equal(typeof ctx.lastInterval, 'function');
  ctx.lastInterval();
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Last update/);
});

test('progress is indeterminate before targetItems and failed candidates still advance progress', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.renderAutomatedNewsBriefProgress(activeRun({ targetItems: null, completedItems: 0, percentComplete: null, phase: 'fetching_tracker', currentWorkflowStep: 'fetch-news-tracker' }));
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Progress percentage will appear/);
  ctx.renderAutomatedNewsBriefProgress(activeRun({ targetItems: null, completedItems: 0, percentComplete: null, phase: 'checking_wocult_archive', currentWorkflowStep: 'fetch-webflow-news-archive' }));
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Checking stories already on Wocult/);
  ctx.renderAutomatedNewsBriefProgress(activeRun({ workflowState: 'retrying', currentWorkflowStep: 'candidate-2-primary-source-discovery', completedItems: 1, targetItems: 5, percentComplete: 20 }));
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Retrying finding primary sources/);
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

test('recovered failed run renders stopped state, actual progress and failure metadata', async () => {
  const { ctx, elements } = loadDashboardHarness();
  const failed = completedRun({
    state: 'failed',
    phase: 'primary_source_discovery',
    completedItems: 3,
    targetItems: 5,
    percentComplete: 60,
    failureStage: 'primary_source_discovery',
    failureCode: 'stale_run_timeout',
    failureMessage: 'Run heartbeat became stale before finalisation.',
    usage: { anthropicCalls: 3, inputTokens: 72931, outputTokens: 3279, webSearchRequests: 7, models: ['claude-test'] },
  });
  ctx.handleAutomatedNewsBriefRunStatus(failed);
  await new Promise((resolve) => setImmediate(resolve));
  const html = elements.get('automated-news-brief-progress').innerHTML;
  assert.match(html, /Dry run stopped/);
  assert.match(html, /Stopped after 3 of 5 candidates/);
  assert.match(html, /60% complete/);
  assert.match(html, /Failure stage: primary_source_discovery/);
  assert.match(html, /stale_run_timeout/);
  assert.match(html, /Input tokens/);
  assert.doesNotMatch(html, /Assessing candidate/);
});

test('POST failure checks server status and does not show failed while run is still running', async () => {
  const { ctx, elements } = loadDashboardHarness({
    workerFetch: async (path) => {
      if (path === '/automation/news-briefs/run') throw new Error('network interrupted');
      if (path.startsWith('/automation/news-briefs/status?runId=')) {
        return { ok: true, json: async () => ({ ok: true, run: activeRun({ state: 'running', phase: 'drafting' }) }) };
      }
      return { ok: true, json: async () => ({ ok: true, activeRun: activeRun({ state: 'running' }) }) };
    },
  });
  await ctx.runAutomatedNewsBriefDryRun();
  assert.match(elements.get('automated-news-briefs-status').textContent, /Connection interrupted\. Checking durable run status/);
  assert.equal(elements.get('automated-news-brief-dry-run-btn').disabled, true);
  assert.doesNotMatch(elements.get('automated-news-briefs-status').textContent, /Dry run failed/);
  assert.match(elements.get('automated-news-brief-progress').innerHTML, /Drafting News Brief|Assessing candidate/);
});

test('Dry run remains disabled while a server lock exists and re-enables after release', async () => {
  let activeLock = true;
  const { ctx, elements } = loadDashboardHarness({
    workerFetch: async (path) => {
      if (path === '/automation/news-briefs/status') {
        return { ok: true, json: async () => ({ ok: true, activeRun: activeLock ? activeRun({ runId: 'run_lock_070707070707070707070707' }) : null }) };
      }
      if (path.startsWith('/automation/news-briefs/status?runId=')) {
        return { ok: true, json: async () => ({ ok: true, run: activeLock ? activeRun({ runId: 'run_lock_070707070707070707070707' }) : completedRun() }) };
      }
      return { ok: true, json: async () => ({ ok: true, run: completedRun() }) };
    },
  });
  await ctx.confirmAutomatedNewsBriefNoActiveLock();
  assert.equal(elements.get('automated-news-brief-dry-run-btn').disabled, true);
  activeLock = false;
  await ctx.confirmAutomatedNewsBriefNoActiveLock();
  assert.equal(elements.get('automated-news-brief-dry-run-btn').disabled, false);
});

test('latest run renders five attempted items in newest-first order with token totals', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.automatedNewsBriefLatestRun = completedRun();
  ctx.automatedNewsBriefFilter = 'latest_run';
  ctx.renderAutomatedNewsBriefList();
  const listHtml = elements.get('automated-news-brief-list').innerHTML;
  assert.match(listHtml, /Candidates assessed by AI/);
  assert.equal((listHtml.match(/Story /g) || []).length, 5);
  assert.ok(listHtml.indexOf('Candidates assessed by AI') < listHtml.indexOf('Story 1'));
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
  assert.match(detailHtml, /Workflow instance/);
  assert.match(detailHtml, /Workflow state/);
  assert.match(detailHtml, /Durable step/);
});

test('latest run renders collapsed Claude call details safely', () => {
  const { ctx } = loadDashboardHarness();
  const html = ctx.automatedNewsBriefRunSummaryHtml(completedRun());
  assert.match(html, /Claude call details/);
  assert.match(html, /Story 1/);
  assert.match(html, /Stage: qualification/);
  assert.match(html, /Attempt: 1/);
  assert.match(html, /Completed/);
  assert.match(html, /Input: 25/);
  assert.match(html, /Output: 10/);
  assert.match(html, /Web searches: 1/);
  assert.match(html, /Duration: 1.2s/);
  assert.match(html, /Interrupted before completion/);
  assert.match(html, /Failure code: anthropic_api_error/);
  assert.match(html, /Attempt: 2/);
  assert.doesNotMatch(html, /PROMPT_SHOULD_NOT_RENDER|RAW_RESPONSE_SHOULD_NOT_RENDER|SEARCH_RESULTS_SHOULD_NOT_RENDER/);
});

test('timestamp objects and invalid dates render safely in Indian local time', () => {
  const { ctx } = loadDashboardHarness();
  assert.doesNotMatch(ctx.formatAutomatedNewsBriefDate({ seconds: 1784178000, nanoseconds: 123000000 }), /Timestamp/);
  assert.doesNotMatch(ctx.formatAutomatedNewsBriefDate({ _seconds: 1784178000, _nanoseconds: 123000000 }), /Timestamp/);
  assert.match(ctx.formatAutomatedNewsBriefDate({ _seconds: 1784178000, _nanoseconds: 123000000 }), /2026/);
  assert.equal(ctx.formatAutomatedNewsBriefDate('not-a-date'), 'Date unavailable');
});

test('historical run without Claude call details renders safe empty state', () => {
  const { ctx } = loadDashboardHarness();
  const html = ctx.automatedNewsBriefRunSummaryHtml(completedRun({ anthropicCallLog: [] }));
  assert.match(html, /Claude call details/);
  assert.match(html, /Detailed call records were not captured for this earlier run/);
});

test('latest run renders preflight-skipped Wocult duplicate items separately with zero Claude usage', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.automatedNewsBriefLatestRun = completedRun();
  ctx.automatedNewsBriefFilter = 'latest_run';
  ctx.renderAutomatedNewsBriefList();
  const listHtml = elements.get('automated-news-brief-list').innerHTML;
  const detailHtml = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(listHtml, /Candidates assessed by AI/);
  assert.doesNotMatch(listHtml, /Published duplicate/);
  assert.match(detailHtml, /Skipped before AI assessment/);
  assert.match(detailHtml, /Already published on Wocult/);
  assert.match(detailHtml, /Possible existing Wocult story/);
  assert.match(detailHtml, /https:\/\/www\.wocult\.com\/news\/existing-story/);
  assert.match(detailHtml, /No Claude tokens were used for this item/);
  assert.doesNotMatch(detailHtml, /Published duplicate <script>/);
  assert.match(detailHtml, /Published duplicate &lt;script&gt;/);
  assert.match(detailHtml, /Matching Wocult URL unavailable/);
});

test('latest run shows empty AI-assessed state without moving skipped items into attempted list', () => {
  const { ctx, elements } = loadDashboardHarness();
  ctx.automatedNewsBriefLatestRun = completedRun({ attemptedItems: [] });
  ctx.automatedNewsBriefFilter = 'latest_run';
  ctx.renderAutomatedNewsBriefList();
  const listHtml = elements.get('automated-news-brief-list').innerHTML;
  const detailHtml = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(listHtml, /Candidates assessed by AI/);
  assert.match(listHtml, /No candidates were assessed by AI in this run/);
  assert.doesNotMatch(listHtml, /Published duplicate|Possible duplicate story/);
  assert.match(detailHtml, /Skipped before AI assessment/);
  assert.match(detailHtml, /Published duplicate/);
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
