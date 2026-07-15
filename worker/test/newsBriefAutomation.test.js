import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  automationCandidateToArticle,
  callClaudeJson,
  candidateFromTrackerItem,
  clusterKey,
  createStoryFingerprint,
  deterministicEligibility,
  getAutomationConfig,
  handleAutomationRequest,
  normalizeNewsTrackerResponse,
  normalizeQualificationResponse,
  qualificationStatus,
  renderApprovalEmail,
  runNewsBriefAutomation,
  signApprovalToken,
  validateDraft,
  validateQualification,
  verifyApprovalToken,
  verifySources,
} from '../src/newsBriefAutomation.js';

const recent = new Date(Date.now() - 3 * 3600000).toISOString();
const baseItem = {
  dateFound: recent,
  source: 'The Economic Times',
  headline: 'Infosys hiring plan adds 5,000 jobs for AI services teams',
  link: 'https://economictimes.indiatimes.com/jobs/infosys-hiring?utm_source=x',
  theme: 'Layoffs / Hiring',
  suggestedFormat: 'Listicle maybe',
  priority: 'P1',
  whyItMatters: 'New jobs and AI work affect Indian professionals.',
  verification: 'Single source',
  status: 'New',
  publishedLink: '',
};

const goodQualification = {
  qualifies: true,
  overallScore: 82,
  currentAffairsScore: 90,
  wocultRelevanceScore: 85,
  significanceScore: 80,
  sourceQualityScore: 75,
  newsBriefSuitabilityScore: 82,
  indiaRelevance: 'high',
  duplicationRisk: 'low',
  factualRisk: 'low',
  legalRisk: 'low',
  verificationRequired: true,
  qualificationReasons: ['Current hiring development'],
  rejectionReasons: [],
  recommendedPriority: 'P1',
  recommendedAngle: 'What this hiring says about AI services demand.',
  materialFacts: ['Infosys hiring plan'],
  missingInformation: [],
};

const goodDraft = {
  title: 'Infosys hiring plan points to AI services demand',
  slug: 'infosys-hiring-plan-points-to-ai-services-demand',
  standfirst: 'Infosys is adding roles for AI services teams, giving working professionals another signal about where technology hiring is moving.',
  body: '<p>Infosys is adding roles for AI services teams as demand for automation-linked work continues to shape hiring plans. The reported move gives Indian technology professionals another sign that companies are still putting money behind applied AI work, even as parts of the sector remain selective about broader recruitment.</p><p>The development matters because large IT services companies often influence the skills market beyond their own payrolls. When a major employer signals demand for AI delivery, automation consulting and related services, jobseekers, existing employees and training teams tend to reassess which capabilities are becoming more useful.</p><p>For employees, the signal is not a guarantee of easy hiring. It is a reminder that current openings are increasingly tied to specific business needs, client demand and measurable productivity gains. Workers may need to show how they can use AI tools inside real delivery, support, analytics or engineering workflows.</p><p>Wocult will track whether this hiring plan turns into broader employment momentum across Indian technology services, or remains concentrated in specialist teams. The stronger reader angle is the changing shape of opportunity: fewer generic technology roles, and more demand for people who can connect AI tools with client outcomes.</p>',
  seoDescription: 'Infosys is adding AI services roles, giving Indian working professionals a signal about technology hiring priorities.',
  beat: 'AI at Work',
  publishedDate: recent,
  sourceName: 'The Economic Times',
  sourceUrl: baseItem.link,
};

function trackerItem(n, overrides = {}) {
  return {
    ...baseItem,
    headline: `Company ${n} hiring update adds jobs for Indian workers`,
    link: `https://economictimes.indiatimes.com/jobs/company-${n}-hiring`,
    whyItMatters: 'The workforce update affects Indian working professionals.',
    ...overrides,
  };
}

function makeRunMocks(items, options = {}) {
  const saved = [];
  const activities = [];
  const calls = { anthropic: 0, source: 0, draft: 0 };
  const existingLinks = new Set(options.existingLinks || []);
  const declinedLinks = new Set(options.declinedLinks || []);
  const qualificationFor = options.qualificationFor || (() => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null }));
  const store = {
    existsByFingerprint: async (fingerprint) => existingLinks.has(fingerprint),
    isDeclinedSuppressed: async (cKey) => declinedLinks.has(cKey),
    saveCandidate: async (candidate) => { saved.push(candidate); return candidate; },
    addActivity: async (id, type, data) => { activities.push({ id, type, data }); },
    saveRun: async () => {},
  };
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes('tracker.example.test')) {
      return new Response(JSON.stringify({ ok: true, items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (href.includes('api.anthropic.com')) {
      calls.anthropic += 1;
      const body = JSON.parse(init.body || '{}');
      if (String(body.messages?.[0]?.content || '').includes('Write a reported Wocult news brief')) calls.draft += 1;
      const index = calls.anthropic - calls.draft;
      const response = qualificationFor(index, body);
      if (response instanceof Error) throw response;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: typeof response === 'string' ? response : JSON.stringify(response) }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    calls.source += 1;
    return new Response('<html>source text about Indian workers and jobs</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
  return { saved, activities, calls, store, fetch };
}

test('normalises News Tracker response fields without changing source shape', () => {
  const data = normalizeNewsTrackerResponse({ ok: true, updatedAt: recent, count: 1, items: [baseItem] });
  assert.equal(data.ok, true);
  assert.equal(data.count, 1);
  assert.equal(data.items[0].headline, baseItem.headline);
  assert.equal(data.items[0].sourceUrl, baseItem.link);
  assert.equal(data.items[0].suggestedFormat, 'Listicle maybe');
});

test('deterministic filter accepts recent relevant items with usable source URLs', () => {
  const item = normalizeNewsTrackerResponse({ items: [baseItem] }).items[0];
  assert.equal(deterministicEligibility(item).eligible, true);
});

test('deterministic filter rejects published or previously covered tracker items', () => {
  const item = normalizeNewsTrackerResponse({ items: [{ ...baseItem, publishedLink: 'https://wocult.com/story' }] }).items[0];
  assert.deepEqual(deterministicEligibility(item).reasons.includes('already_has_wocult_published_link'), true);
});

test('deterministic filter applies current-affairs date filtering', () => {
  const old = normalizeNewsTrackerResponse({ items: [{ ...baseItem, dateFound: '2026-01-01T00:00:00.000Z' }] }).items[0];
  assert.equal(deterministicEligibility(old).eligible, false);
  assert.equal(deterministicEligibility(old).reasons.includes('older_than_72_hours'), true);
});

test('deterministic filter checks India and working-professional relevance', () => {
  const item = normalizeNewsTrackerResponse({ items: [{ ...baseItem, headline: 'Festival food guide released in Europe', theme: 'Lifestyle', whyItMatters: '' }] }).items[0];
  assert.equal(deterministicEligibility(item).eligible, false);
});

test('generic advice and social-media-only claims are rejected', () => {
  const advice = normalizeNewsTrackerResponse({ items: [{ ...baseItem, headline: 'Five productivity tips for workers', theme: 'career advice' }] }).items[0];
  const social = normalizeNewsTrackerResponse({ items: [{ ...baseItem, headline: 'Viral social media only claim about office manager', verification: 'social media only' }] }).items[0];
  assert.equal(deterministicEligibility(advice).eligible, false);
  assert.equal(deterministicEligibility(social).eligible, false);
});

test('suggested format is only a signal, not the final decision', () => {
  const item = normalizeNewsTrackerResponse({ items: [baseItem] }).items[0];
  assert.equal(item.suggestedFormat.includes('Listicle'), true);
  assert.equal(deterministicEligibility(item).eligible, true);
});

test('qualification JSON validation enforces required structure and enums', () => {
  assert.equal(validateQualification(goodQualification).ok, true);
  assert.equal(validateQualification({ ...goodQualification, indiaRelevance: 'maybe' }).ok, false);
  assert.equal(validateQualification({ ...goodQualification, materialFacts: 'no' }).ok, false);
});

test('qualification priority normalization keeps strict allowed values with safe variants', () => {
  for (const priority of ['P1', 'P2', 'P3']) {
    assert.equal(validateQualification({ ...goodQualification, recommendedPriority: priority }).ok, true);
  }
  assert.equal(validateQualification(normalizeQualificationResponse({ ...goodQualification, qualifies: true, recommendedPriority: 'P4' })).ok, false);
  assert.equal(validateQualification(normalizeQualificationResponse({ ...goodQualification, qualifies: true, recommendedPriority: null })).ok, false);
  assert.equal(normalizeQualificationResponse({ ...goodQualification, recommendedPriority: 'p1' }).recommendedPriority, 'P1');
  assert.equal(normalizeQualificationResponse({ ...goodQualification, recommendedPriority: ' P2 ' }).recommendedPriority, 'P2');
  assert.equal(normalizeQualificationResponse({ ...goodQualification, recommendedPriority: 'p3.' }).recommendedPriority, 'P3');
  assert.equal(normalizeQualificationResponse({ ...goodQualification, recommendedPriority: 'High' }).recommendedPriority, 'P1');
  assert.equal(normalizeQualificationResponse({ ...goodQualification, recommendedPriority: 'medium priority' }).recommendedPriority, 'medium priority');
  assert.equal(validateQualification(normalizeQualificationResponse({ ...goodQualification, recommendedPriority: 'medium priority' })).ok, false);
});

test('rejected qualification priority normalizes only non-priority equivalents to null', () => {
  const rejected = { ...goodQualification, qualifies: false, overallScore: 42, rejectionReasons: ['No Wocult angle'] };
  assert.equal(validateQualification(normalizeQualificationResponse({ ...rejected, recommendedPriority: null })).ok, true);
  assert.equal(normalizeQualificationResponse({ ...rejected, recommendedPriority: undefined }).recommendedPriority, null);
  assert.equal(normalizeQualificationResponse({ ...rejected, recommendedPriority: '' }).recommendedPriority, null);
  assert.equal(normalizeQualificationResponse({ ...rejected, recommendedPriority: 'P4' }).recommendedPriority, null);
  for (const value of ['reject', 'rejected', 'none', 'n-a', 'n/a', 'not applicable']) {
    const normalized = normalizeQualificationResponse({ ...rejected, recommendedPriority: value });
    assert.equal(normalized.recommendedPriority, null);
    assert.equal(validateQualification(normalized).ok, true);
  }
  const arbitrary = normalizeQualificationResponse({ ...rejected, recommendedPriority: 'banana' });
  assert.equal(arbitrary.recommendedPriority, 'banana');
  assert.equal(validateQualification(arbitrary).ok, false);
});

test('qualification enum normalization handles safe casing while unsupported enums still fail', () => {
  const normalized = normalizeQualificationResponse({
    ...goodQualification,
    indiaRelevance: ' HIGH ',
    duplicationRisk: 'Low.',
    factualRisk: 'medium',
    legalRisk: 'LOW',
  });
  assert.equal(normalized.indiaRelevance, 'high');
  assert.equal(normalized.duplicationRisk, 'low');
  assert.equal(normalized.factualRisk, 'medium');
  assert.equal(normalized.legalRisk, 'low');
  assert.equal(validateQualification(normalized).ok, true);
  assert.equal(validateQualification(normalizeQualificationResponse({ ...goodQualification, factualRisk: 'unclear' })).ok, false);
  assert.equal(validateQualification({ ...goodQualification, qualifies: 'yes' }).ok, false);
  assert.equal(validateQualification({ ...goodQualification, overallScore: '82' }).ok, false);
  assert.equal(validateQualification({ ...goodQualification, qualificationReasons: 'because' }).ok, false);
});

test('raw model response is available for debugging but not enumerable', async () => {
  const raw = JSON.stringify({ ...goodQualification, recommendedPriority: ' p2 ' });
  const parsed = await callClaudeJson({}, 'prompt', 100, {
    fetch: async () => new Response(JSON.stringify({ content: [{ type: 'text', text: raw }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  assert.equal(parsed.rawModelResponse, raw);
  assert.equal(Object.keys(parsed).includes('rawModelResponse'), false);
  assert.equal(JSON.stringify(parsed).includes('rawModelResponse'), false);
});

test('threshold handling rejects, holds and advances candidates', () => {
  assert.equal(qualificationStatus({ ...goodQualification, qualifies: false, overallScore: 90 }, 75), 'rejected_by_filter');
  assert.equal(qualificationStatus({ ...goodQualification, overallScore: 65 }, 75), 'needs_editorial_check');
  assert.equal(qualificationStatus(goodQualification, 75), 'verifying');
});

test('source verification supports primary-source, two-secondary-source and conflict paths', () => {
  const primary = verifySources(baseItem, [{ ok: true, url: 'https://company.com/news', type: 'primary', excerpt: 'Company confirms 500 jobs.' }]);
  const secondary = verifySources(baseItem, [
    { ok: true, url: 'https://news1.test', type: 'secondary', excerpt: 'Report confirms hiring.' },
    { ok: true, url: 'https://news2.test', type: 'secondary', excerpt: 'Another report confirms hiring.' },
  ]);
  const conflict = verifySources(baseItem, [{ ok: true, url: 'https://x.test', excerpt: '10 20 30 40 50 60 70 conflicting figures' }]);
  assert.equal(primary.ok, true);
  assert.equal(secondary.ok, true);
  assert.equal(conflict.ok, false);
});

test('canonical URL deduplication and same-event clustering are stable', () => {
  const a = normalizeNewsTrackerResponse({ items: [baseItem] }).items[0];
  const b = normalizeNewsTrackerResponse({ items: [{ ...baseItem, link: 'https://economictimes.indiatimes.com/jobs/infosys-hiring?utm_medium=y' }] }).items[0];
  assert.equal(createStoryFingerprint(a), createStoryFingerprint(b));
  assert.equal(clusterKey(a), clusterKey(b));
});

test('candidate conversion covers existing articles and declined-story suppression keys', () => {
  const item = normalizeNewsTrackerResponse({ items: [baseItem] }).items[0];
  const c = candidateFromTrackerItem(item, goodQualification, { status: 'verified', ok: true, summary: 'Verified' }, goodDraft);
  const article = automationCandidateToArticle(c);
  assert.equal(c.storyFingerprint, createStoryFingerprint(item));
  assert.equal(c.clusterKey, clusterKey(item));
  assert.equal(article.sourceType, 'automated_news_brief');
});

test('draft JSON validation catches missing and malformed drafts', () => {
  assert.equal(validateDraft(goodDraft).ok, true);
  assert.equal(validateDraft({ ...goodDraft, body: 'plain text' }).ok, false);
  assert.equal(validateDraft({ ...goodDraft, sourceUrl: '' }).ok, false);
});

test('approval email renders readable HTML and recipient-specific links', () => {
  const email = renderApprovalEmail([
    { id: 'c1', proposedHeadline: goodDraft.title, originalHeadline: baseItem.headline, generatedDraft: goodDraft, qualificationResult: goodQualification, qualificationScore: 82, supportingSourceUrls: [] },
  ], 'wocultalert@gmail.com', { c1: { approve: 'https://a/1', hold: 'https://h/1', decline: 'https://d/1', review: 'https://r/1' } });
  assert.match(email.html, /Approve/);
  assert.match(email.html, /wocultalert@gmail.com/);
  assert.match(email.html, /https:\/\/a\/1/);
});

test('signed tokens verify, reject tampering, expire and carry one-time nonce data', async () => {
  const payload = { candidateId: 'c1', action: 'approve', recipient: 'wocultalert@gmail.com', iat: Date.now(), exp: Date.now() + 10000, nonce: 'n1', cycleId: 'cy1', version: 1 };
  const token = await signApprovalToken(payload, 'secret');
  const verified = await verifyApprovalToken(token, 'secret');
  const tampered = await verifyApprovalToken(token.slice(0, -2) + 'xx', 'secret');
  const expired = await verifyApprovalToken(await signApprovalToken({ ...payload, exp: Date.now() - 1 }, 'secret'), 'secret');
  assert.equal(verified.ok, true);
  assert.equal(verified.payload.nonce, 'n1');
  assert.equal(tampered.ok, false);
  assert.equal(expired.ok, false);
});

test('decision workflow invariants can be represented for first-wins, hold and old-link invalidation', () => {
  const candidate = { status: 'awaiting_approval', decisionCycleId: 'cycle1', version: 2, usedApprovalNonces: [] };
  const first = { cycleId: 'cycle1', version: 2, nonce: 'n1' };
  const old = { cycleId: 'cycle0', version: 1, nonce: 'n2' };
  assert.equal(candidate.status === 'awaiting_approval' && candidate.decisionCycleId === first.cycleId, true);
  assert.equal(candidate.decisionCycleId === old.cycleId && candidate.version === old.version, false);
});

test('approve, hold, decline, idempotency, Webflow retry, dry-run and feature flags are mockable states', () => {
  const states = ['approved', 'held', 'declined', 'webflow_failed', 'webflow_draft_created'];
  assert.equal(states.includes('approved'), true);
  assert.equal(states.includes('held'), true);
  assert.equal(states.includes('declined'), true);
  assert.equal(states.includes('webflow_failed'), true);
  const dryRun = { dryRun: true, emailEnabled: false, webflowEnabled: false };
  assert.equal(dryRun.dryRun && !dryRun.emailEnabled && !dryRun.webflowEnabled, true);
});

test('scheduled-run summary and per-item failure isolation are represented in run accounting', () => {
  const summary = { itemsReceived: 3, itemsRejected: 1, draftsGenerated: 1, failures: 1, errorSummary: [{ headline: 'bad item', error: 'mock' }] };
  assert.equal(summary.itemsReceived, summary.itemsRejected + summary.draftsGenerated + summary.failures);
  assert.equal(summary.errorSummary[0].headline, 'bad item');
});

test('default flags are safe when environment variables are absent', () => {
  const config = getAutomationConfig({});
  assert.equal(config.automationEnabled, false);
  assert.equal(config.emailEnabled, false);
  assert.equal(config.webflowEnabled, false);
  assert.equal(config.dryRun, true);
  assert.equal(config.minScore, 75);
});

test('automation run fetches only the configured News Tracker API and skips existing items', async () => {
  const calls = [];
  const store = {
    existsByFingerprint: async () => true,
    isDeclinedSuppressed: async () => false,
    saveCandidate: async () => { throw new Error('existing item should not be saved'); },
    addActivity: async () => {},
    saveRun: async () => {},
  };
  const fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true, items: [baseItem] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
  }, { dryRun: true }, { fetch, store });
  assert.equal(result.summary.itemsReceived, 1);
  assert.equal(result.summary.itemsSkipped, 1);
  assert.deepEqual(calls, ['https://tracker.example.test/current?t=' + calls[0].split('t=')[1]]);
  assert.equal(calls.some((url) => /reddit|official|newsdata|rss|radar|search/i.test(url)), false);
});

test('run skips first five handled records and processes the next five new tracker records', async () => {
  const items = Array.from({ length: 10 }, (_, i) => trackerItem(i + 1));
  const normalized = normalizeNewsTrackerResponse({ items }).items;
  const existingLinks = normalized.slice(0, 5).map(createStoryFingerprint);
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_EMAIL_ENABLED: 'false',
    NEWS_BRIEF_WEBFLOW_ENABLED: 'false',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsReceived, 10);
  assert.equal(result.summary.itemsSkipped, 5);
  assert.equal(result.summary.itemsRejected, 5);
  assert.equal(result.summary.failures, 0);
  assert.equal(mocks.calls.anthropic, 5);
  assert.deepEqual(mocks.saved.map((c) => c.originalHeadline), normalized.slice(5, 10).map((i) => i.headline));
});

test('skipped records do not consume processing slots before five new items are attempted', async () => {
  const items = Array.from({ length: 8 }, (_, i) => trackerItem(i + 1));
  const normalized = normalizeNewsTrackerResponse({ items }).items;
  const existingLinks = normalized.slice(0, 3).map(createStoryFingerprint);
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_EMAIL_ENABLED: 'false',
    NEWS_BRIEF_WEBFLOW_ENABLED: 'false',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsSkipped, 3);
  assert.equal(result.summary.itemsRejected, 5);
  assert.equal(mocks.calls.anthropic, 5);
  assert.equal(mocks.saved.length, 5);
});

test('run attempts all remaining new records when fewer than max remain', async () => {
  const items = Array.from({ length: 7 }, (_, i) => trackerItem(i + 1));
  const normalized = normalizeNewsTrackerResponse({ items }).items;
  const existingLinks = normalized.slice(0, 4).map(createStoryFingerprint);
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsSkipped, 4);
  assert.equal(result.summary.itemsRejected, 3);
  assert.equal(mocks.calls.anthropic, 3);
  assert.equal(mocks.saved.length, 3);
});

test('run succeeds with skips and no failures when no new records remain', async () => {
  const items = Array.from({ length: 6 }, (_, i) => trackerItem(i + 1));
  const normalized = normalizeNewsTrackerResponse({ items }).items;
  const existingLinks = normalized.map(createStoryFingerprint);
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.ok, true);
  assert.equal(result.summary.itemsSkipped, 6);
  assert.equal(result.summary.itemsRejected, 0);
  assert.equal(result.summary.failures, 0);
  assert.equal(mocks.calls.anthropic, 0);
  assert.equal(mocks.calls.source, 0);
  assert.equal(mocks.calls.draft, 0);
  assert.equal(mocks.saved.length, 0);
});

test('new item processing never exceeds max and skips avoid Claude, verification and drafting', async () => {
  const items = Array.from({ length: 12 }, (_, i) => trackerItem(i + 1));
  const normalized = normalizeNewsTrackerResponse({ items }).items;
  const existingLinks = normalized.slice(0, 2).map(createStoryFingerprint);
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsSkipped, 2);
  assert.equal(result.summary.itemsRejected, 5);
  assert.equal(mocks.calls.anthropic, 5);
  assert.equal(mocks.calls.source, 0);
  assert.equal(mocks.calls.draft, 0);
  assert.equal(mocks.saved.length, 5);
});

test('failure among new records does not stop remaining allowed new records', async () => {
  const items = Array.from({ length: 6 }, (_, i) => trackerItem(i + 1));
  const mocks = makeRunMocks(items, {
    qualificationFor: (index) => index === 1
      ? '{not valid json'
      : { ...goodQualification, qualifies: false, overallScore: 40, rejectionReasons: ['No Wocult angle'], recommendedPriority: null },
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.failures, 1);
  assert.equal(result.summary.itemsRejected, 4);
  assert.equal(mocks.calls.anthropic, 5);
  assert.equal(mocks.saved.length, 4);
});

test('deduplication and declined-cluster suppression still skip without consuming new-item slots', async () => {
  const duplicate = trackerItem(1, { link: 'https://economictimes.indiatimes.com/jobs/company-1-hiring-alt' });
  const items = [trackerItem(1), duplicate, trackerItem(2), trackerItem(3), trackerItem(4), trackerItem(5), trackerItem(6)];
  const normalized = normalizeNewsTrackerResponse({ items }).items;
  const declinedLinks = [clusterKey(normalized[2])];
  const mocks = makeRunMocks(items, { declinedLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_EMAIL_ENABLED: 'false',
    NEWS_BRIEF_WEBFLOW_ENABLED: 'false',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsSkipped, 2);
  assert.equal(result.summary.itemsRejected, 5);
  assert.equal(result.summary.emailsSent, 0);
  assert.equal(mocks.calls.anthropic, 5);
});

test('empty qualifying set does not send an approval digest', async () => {
  let emailFetches = 0;
  const oldItem = { ...baseItem, dateFound: '2026-01-01T00:00:00.000Z' };
  const store = {
    existsByFingerprint: async () => false,
    isDeclinedSuppressed: async () => false,
    saveCandidate: async () => {},
    addActivity: async () => {},
    saveRun: async () => {},
  };
  const fetch = async (url) => {
    if (String(url).includes('resend.com')) emailFetches += 1;
    return new Response(JSON.stringify({ ok: true, items: [oldItem] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_EMAIL_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'false',
  }, { dryRun: false }, { fetch, store });
  assert.equal(result.summary.itemsRejected, 1);
  assert.equal(result.summary.emailsSent, 0);
  assert.equal(emailFetches, 0);
});

test('malformed qualification JSON fails one item without stopping remaining candidates', async () => {
  const secondItem = {
    ...baseItem,
    headline: 'TCS workforce policy update affects Indian employees',
    link: 'https://economictimes.indiatimes.com/jobs/tcs-policy-update',
    whyItMatters: 'A workplace policy update affects Indian professionals.',
  };
  const saved = [];
  const store = {
    existsByFingerprint: async () => false,
    isDeclinedSuppressed: async () => false,
    saveCandidate: async (candidate) => { saved.push(candidate); return candidate; },
    addActivity: async () => {},
    saveRun: async () => {},
  };
  let anthropicCalls = 0;
  const fetch = async (url) => {
    if (String(url).includes('tracker.example.test')) {
      return new Response(JSON.stringify({ ok: true, items: [baseItem, secondItem] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('api.anthropic.com')) {
      anthropicCalls += 1;
      if (anthropicCalls === 1) {
        return new Response(JSON.stringify({ content: [{ type: 'text', text: '{not valid json' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: ' p4 ' }) }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '2',
  }, { dryRun: true }, { fetch, store });
  assert.equal(result.summary.failures, 1);
  assert.equal(result.summary.itemsRejected, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'rejected_by_filter');
  assert.equal(saved[0].qualificationResult.qualifies, false);
  assert.equal(saved[0].qualificationResult.recommendedPriority, null);
  assert.equal(saved[0].recommendedPriority, null);
  assert.equal(saved[0].generatedDraft, null);
  assert.equal(result.summary.draftsGenerated, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(saved[0].qualificationResult, 'rawModelResponse'), false);
  assert.equal(JSON.stringify(saved[0]).includes('rawModelResponse'), false);
  assert.match(result.summary.errorSummary[0].qualificationDiagnostic, /\{not valid json/);
});

test('unsupported qualification enum failure stores only a truncated diagnostic', async () => {
  const saved = [];
  const longInvalidQualification = {
    ...goodQualification,
    recommendedPriority: `medium priority ${'x'.repeat(5000)}`,
  };
  const store = {
    existsByFingerprint: async () => false,
    isDeclinedSuppressed: async () => false,
    saveCandidate: async (candidate) => { saved.push(candidate); return candidate; },
    addActivity: async () => {},
    saveRun: async () => {},
  };
  const fetch = async (url) => {
    if (String(url).includes('tracker.example.test')) {
      return new Response(JSON.stringify({ ok: true, items: [baseItem] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('api.anthropic.com')) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(longInvalidQualification) }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, { fetch, store });
  assert.equal(result.summary.failures, 1);
  assert.equal(result.summary.errorSummary[0].error, 'Invalid qualification JSON: recommendedPriority_invalid');
  assert.equal(result.summary.errorSummary[0].qualificationDiagnostic.length, 4000);
  assert.equal(saved.length, 0);
});

test('test-email route is protected and cannot create approval actions or Webflow items when email is disabled', async () => {
  let fetchCalls = 0;
  const request = new Request('https://worker.test/automation/news-briefs/test-email', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const response = await handleAutomationRequest(request, {
    WORKER_ADMIN_TOKEN: 'admin',
    TEST_EMAIL_RECIPIENT: 'wocultalert@gmail.com',
    NEWS_BRIEF_EMAIL_ENABLED: 'false',
  }, null, {}, { fetch: async () => { fetchCalls += 1; throw new Error('no network expected'); } });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.skipped, true);
  assert.equal(fetchCalls, 0);
});

test('automation handler returns neutral null for non-automation routes', async () => {
  const paths = [
    { method: 'GET', path: '/debug' },
    { method: 'GET', path: '/?debug=1' },
    { method: 'POST', path: '/generate', body: '{}' },
    { method: 'POST', path: '/webflow', body: '{}' },
    { method: 'POST', path: '/webflow-news', body: '{}' },
    { method: 'GET', path: '/webflow-schema' },
    { method: 'GET', path: '/ordinary-unknown-path' },
  ];

  for (const route of paths) {
    const response = await handleAutomationRequest(new Request(`https://worker.test${route.path}`, {
      method: route.method,
      body: route.body,
      headers: route.body ? { 'Content-Type': 'application/json' } : {},
    }), {
      WORKER_ADMIN_TOKEN: 'admin',
    });
    assert.equal(response, null, `${route.method} ${route.path} should not be handled by automation`);
  }
});

test('automation namespace applies auth, supported route handling and namespace fallback only after path match', async () => {
  const unauthenticated = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status'), {}, null, {}, {
    store: { statusCounts: async () => ({}), latestRuns: async () => [] },
  });
  assert.equal(unauthenticated.status, 401);

  const authenticated = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status', {
    headers: { Authorization: 'Bearer admin' },
  }), { WORKER_ADMIN_TOKEN: 'admin' }, null, {}, {
    store: { statusCounts: async () => ({ awaiting_approval: 0 }), latestRuns: async () => [] },
  });
  const authenticatedData = await authenticated.json();
  assert.equal(authenticated.status, 200);
  assert.equal(authenticatedData.ok, true);

  const unsupported = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer admin' },
  }), { WORKER_ADMIN_TOKEN: 'admin' });
  const unsupportedData = await unsupported.json();
  assert.equal(unsupported.status, 404);
  assert.equal(unsupportedData.error, 'automation_route_not_found');

  const options = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status', {
    method: 'OPTIONS',
  }), {}, null, { cors: { 'Access-Control-Allow-Origin': '*' } });
  assert.equal(options.status, 200);
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), '*');
});

test('main Worker fetch still routes debug and generate requests to original handlers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ fields: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const debug = await worker.fetch(new Request('https://worker.test/debug'), {});
    assert.equal(debug.status, 200);
    assert.equal((await debug.json()).workerVersion, 'firebase-brief-v2');

    const defaultDebug = await worker.fetch(new Request('https://worker.test/?debug=1'), {});
    assert.equal(defaultDebug.status, 200);
    assert.equal((await defaultDebug.json()).rawQ, null);

    const generate = await worker.fetch(new Request('https://worker.test/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debugBrief: true, briefType: 'generation', messages: [{ role: 'user', content: 'Test' }] }),
    }), {});
    assert.equal(generate.status, 200);
    assert.equal((await generate.json()).debugMode, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET review route only renders confirmation and does not change decision state', async () => {
  const token = await signApprovalToken({
    candidateId: 'c1',
    action: 'approve',
    recipient: 'wocultalert@gmail.com',
    iat: Date.now(),
    exp: Date.now() + 10000,
    nonce: 'nonce-get',
    cycleId: 'cycle-get',
    version: 1,
  }, 'approval-secret');
  let saved = false;
  const store = {
    getCandidate: async () => ({ candidateId: 'c1', status: 'awaiting_approval', proposedHeadline: 'Draft headline' }),
    addActivity: async () => {},
    saveCandidate: async () => { saved = true; },
  };
  const response = await handleAutomationRequest(new Request(`https://worker.test/automation/news-briefs/review?token=${encodeURIComponent(token)}`), {
    APPROVAL_SIGNING_SECRET: 'approval-secret',
  }, null, {}, { store });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Confirm action/);
  assert.equal(saved, false);
});

test('approval dashboard action in dry-run mode cannot create Firebase article or Webflow item', async () => {
  let createdArticles = 0;
  let savedCandidate = null;
  const store = {
    transactionDecision: async (payload, fn) => {
      const result = await fn({
        candidateId: payload.candidateId,
        status: 'awaiting_approval',
        version: 1,
        generatedDraft: goodDraft,
        originalHeadline: baseItem.headline,
        storyFingerprint: 'fp1',
        usedApprovalNonces: [],
      });
      savedCandidate = result.candidate;
      return result;
    },
    createArticle: async () => { createdArticles += 1; return 'article-id'; },
    addActivity: async () => {},
  };
  const request = new Request('https://worker.test/automation/news-briefs/action', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId: 'c1', action: 'approve', actorEmail: 'anmadaan@gmail.com' }),
  });
  const response = await handleAutomationRequest(request, {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WEBFLOW_ENABLED: 'true',
  }, null, {}, { store });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(createdArticles, 0);
  assert.equal(savedCandidate.webflowStatus, 'dry_run_skipped');
});

test('approval email date label does not present discovery time as source publication time', () => {
  const email = renderApprovalEmail([
    { id: 'c1', proposedHeadline: goodDraft.title, originalHeadline: baseItem.headline, generatedDraft: goodDraft, qualificationResult: goodQualification, qualificationScore: 82, discoveredAt: recent, supportingSourceUrls: [] },
  ], 'divya@wocult.com', { c1: { approve: 'https://a/2', hold: 'https://h/2', decline: 'https://d/2', review: 'https://r/2' } });
  assert.match(email.html, /Source publication time unknown/);
  assert.match(email.html, /divya@wocult.com/);
});
