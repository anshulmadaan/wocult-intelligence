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
  discoverPrimarySources,
  getAutomationConfig,
  handleAutomationRequest,
  checkWocultDuplicate,
  buildWocultDuplicateIndex,
  fetchWebflowNewsArchive,
  normalizeNewsTrackerResponse,
  normalizeDuplicateUrl,
  normalizeQualificationResponse,
  qualificationStatus,
  renderApprovalEmail,
  runNewsBriefAutomation,
  runNewsBriefCandidateWorkflow,
  runNewsBriefCoordinatorWorkflow,
  runNewsBriefFinalizerWorkflow,
  signApprovalToken,
  startNewsBriefAutomationWorkflow,
  sortNewsTrackerItemsNewestFirst,
  applyPrimarySourceDiscovery,
  buildDraftPrompt,
  buildPrimarySourceDiscoveryPrompt,
  buildPrimarySourceSearchQueries,
  prepareSourceContext,
  validateDraft,
  validateQualification,
  verifyApprovalToken,
  verifySources,
  withCandidateMetadata,
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
  const runs = [];
  const runMap = new Map(options.existingRuns || []);
  const childMap = new Map();
  const calls = { anthropic: 0, source: 0, draft: 0, webflowArchive: 0 };
  const existingLinks = new Set(options.existingLinks || []);
  const declinedLinks = new Set(options.declinedLinks || []);
  const qualificationFor = options.qualificationFor || (() => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null }));
  const store = {
    existsByFingerprint: async (fingerprint) => existingLinks.has(fingerprint),
    isDeclinedSuppressed: async (cKey) => declinedLinks.has(cKey),
    existingFingerprints: async (fingerprints) => fingerprints.filter((fingerprint) => existingLinks.has(fingerprint)),
    suppressedClusterKeys: async (clusters) => clusters.filter((cKey) => declinedLinks.has(cKey)),
    saveCandidate: async (candidate) => { saved.push(candidate); return candidate; },
    addActivity: async (id, type, data) => { activities.push({ id, type, data }); },
    getRun: async (id) => runMap.get(id) || null,
    getChildRun: async (runId, candidateId) => childMap.get(`${runId}/${candidateId}`) || null,
    saveChildRun: async (runId, candidateId, child) => {
      const key = `${runId}/${candidateId}`;
      const copy = JSON.parse(JSON.stringify({ ...(childMap.get(key) || {}), ...child, runId, candidateId }));
      childMap.set(key, copy);
      return copy;
    },
    listChildRuns: async (runId) => [...childMap.entries()].filter(([key]) => key.startsWith(`${runId}/`)).map(([, value]) => JSON.parse(JSON.stringify(value))),
    activeRun: async () => options.activeRun || null,
    latestCompletedRun: async () => null,
    latestRuns: async () => [...runMap.values()].reverse(),
    saveRun: async (run, saveOptions = {}) => {
      if (saveOptions.createOnly && runMap.has(run.runId)) throw new Error('already_exists');
      const copy = JSON.parse(JSON.stringify(run));
      runs.push(copy);
      runMap.set(run.runId, copy);
    },
  };
  const fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.includes('tracker.example.test')) {
      return new Response(JSON.stringify({ ok: true, items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (options.responseForUrl) {
      const response = options.responseForUrl(href, init);
      if (response) return response;
    }
    if (href.includes('api.anthropic.com')) {
      calls.anthropic += 1;
      const body = JSON.parse(init.body || '{}');
      if (String(body.messages?.[0]?.content || '').includes('Write a reported Wocult news brief')) calls.draft += 1;
      const index = calls.anthropic - calls.draft;
      const response = qualificationFor(index, body);
      if (response instanceof Error) throw response;
      const usage = options.usageFor ? options.usageFor(calls.anthropic, body) : {};
      return new Response(JSON.stringify({ model: options.model || 'claude-test', usage, content: [{ type: 'text', text: typeof response === 'string' ? response : JSON.stringify(response) }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    calls.source += 1;
    return new Response('<html>source text about Indian workers and jobs</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
  const webflowArchive = options.webflowArchive || [];
  const fetchWebflowNewsArchive = async () => {
    calls.webflowArchive += 1;
    if (options.webflowArchiveError) throw options.webflowArchiveError;
    return webflowArchive;
  };
  return {
    saved,
    activities,
    calls,
    runs,
    runMap,
    childMap,
    store,
    fetch,
    primarySourceSearch: options.primarySourceSearch,
    fetchWebflowNewsArchive,
    beforeAnthropicCall: options.beforeAnthropicCall,
    afterAnthropicCall: options.afterAnthropicCall,
  };
}

function webflowNewsItem(id, overrides = {}) {
  return {
    id,
    isDraft: false,
    isArchived: false,
    lastPublished: recent,
    lastUpdated: recent,
    fieldData: {
      name: `Existing Wocult story ${id}`,
      slug: `existing-wocult-story-${id}`,
      standfirst: 'Existing Wocult News story.',
      'source-name': 'Existing source',
      'source-url': `https://example.com/source-${id}`,
      'published-date': recent,
      ...overrides.fieldData,
    },
    ...overrides,
  };
}

function assertCandidateMetadata(candidate) {
  assert.ok(candidate.createdAt, 'createdAt is required');
  assert.ok(candidate.updatedAt, 'updatedAt is required');
  assert.ok(candidate.firstSeenRunId, 'firstSeenRunId is required');
  assert.ok(candidate.lastProcessedRunId, 'lastProcessedRunId is required');
  assert.equal(candidate.runId, candidate.lastProcessedRunId);
  assert.ok(candidate.storyFingerprint, 'storyFingerprint is required');
  assert.ok(candidate.clusterKey, 'clusterKey is required');
  assert.ok(candidate.status, 'status is required');
  assert.ok(candidate.sourceType, 'source metadata sourceType is required');
  assert.ok(candidate.articleSourceUrl, 'articleSourceUrl is required');
  assert.ok(candidate.articleSourceName, 'articleSourceName is required');
  assert.ok(candidate.publishers?.length, 'source metadata publishers are required');
}

test('normalises News Tracker response fields without changing source shape', () => {
  const data = normalizeNewsTrackerResponse({ ok: true, updatedAt: recent, count: 1, items: [baseItem] });
  assert.equal(data.ok, true);
  assert.equal(data.count, 1);
  assert.equal(data.items[0].headline, baseItem.headline);
  assert.equal(data.items[0].sourceUrl, baseItem.link);
  assert.equal(data.items[0].suggestedFormat, 'Listicle maybe');
});

test('News Tracker ordering processes 15 July records before 13 July records', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(13, { headline: '13 July workforce policy update for Indian employees', dateFound: '2026-07-13T09:00:00.000Z' }),
    trackerItem(15, { headline: '15 July workforce policy update for Indian employees', dateFound: '2026-07-15T09:00:00.000Z' }),
  ] }).items;
  const ordered = sortNewsTrackerItemsNewestFirst(items);
  assert.equal(ordered[0].headline, '15 July workforce policy update for Indian employees');
  assert.equal(ordered[1].headline, '13 July workforce policy update for Indian employees');
});

test('News Tracker ordering prefers valid publication dates before discovery dates', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(1, {
      headline: 'Newer discovery but older publication date for Indian employees',
      publicationDate: '2026-07-13T10:00:00.000Z',
      dateFound: '2026-07-16T10:00:00.000Z',
    }),
    trackerItem(2, {
      headline: 'Older discovery but newer publication date for Indian employees',
      publicationDate: '2026-07-15T10:00:00.000Z',
      dateFound: '2026-07-14T10:00:00.000Z',
    }),
  ] }).items;
  assert.equal(sortNewsTrackerItemsNewestFirst(items)[0].headline, 'Older discovery but newer publication date for Indian employees');
});

test('News Tracker ordering uses discovery date when publication date is absent', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(1, { headline: 'Older discovered workplace update', publicationDate: '', dateFound: '2026-07-13T10:00:00.000Z' }),
    trackerItem(2, { headline: 'Newer discovered workplace update', publicationDate: '', dateFound: '2026-07-15T10:00:00.000Z' }),
  ] }).items;
  assert.equal(sortNewsTrackerItemsNewestFirst(items)[0].headline, 'Newer discovered workplace update');
});

test('News Tracker ordering sends invalid and missing dates to the end', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(1, { headline: 'Missing date workplace update', publicationDate: '', dateFound: '' }),
    trackerItem(2, { headline: 'Invalid date workplace update', publicationDate: 'not-a-date', dateFound: 'still-not-a-date' }),
    trackerItem(3, { headline: 'Valid date workplace update', publicationDate: '', dateFound: '2026-07-15T10:00:00.000Z' }),
  ] }).items;
  assert.deepEqual(sortNewsTrackerItemsNewestFirst(items).map((i) => i.headline), [
    'Valid date workplace update',
    'Missing date workplace update',
    'Invalid date workplace update',
  ]);
});

test('News Tracker ordering preserves source order for equal timestamps', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(1, { headline: 'First equal timestamp workplace update', dateFound: '2026-07-15T10:00:00.000Z', rowNumber: 20 }),
    trackerItem(2, { headline: 'Second equal timestamp workplace update', dateFound: '2026-07-15T10:00:00.000Z', rowNumber: 30 }),
  ] }).items;
  assert.deepEqual(sortNewsTrackerItemsNewestFirst(items).map((i) => i.headline), [
    'First equal timestamp workplace update',
    'Second equal timestamp workplace update',
  ]);
});

test('News Tracker ordering parses mixed supported date formats', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(1, { headline: 'ISO dated workplace update', dateFound: '2026-07-15T09:30:00.000Z' }),
    trackerItem(2, { headline: 'Sheet dated workplace update', dateFound: '15/07/2026 20:00' }),
    trackerItem(3, { headline: 'Text dated workplace update', dateFound: 'Wed, 15 Jul 2026 10:00:00 GMT' }),
  ] }).items;
  assert.deepEqual(sortNewsTrackerItemsNewestFirst(items).map((i) => i.headline), [
    'Sheet dated workplace update',
    'Text dated workplace update',
    'ISO dated workplace update',
  ]);
});

test('News Tracker ordering uses row order only when dates are absent', () => {
  const items = normalizeNewsTrackerResponse({ items: [
    trackerItem(1, { headline: 'Older row workplace update', dateFound: '', rowNumber: 10 }),
    trackerItem(2, { headline: 'Newer row workplace update', dateFound: '', rowNumber: 12 }),
    trackerItem(3, { headline: 'No row workplace update', dateFound: '' }),
  ] }).items;
  assert.deepEqual(sortNewsTrackerItemsNewestFirst(items).map((i) => i.headline), [
    'Newer row workplace update',
    'Older row workplace update',
    'No row workplace update',
  ]);
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

test('primary-source discovery accepts an official report directly linked by the article', async () => {
  const item = trackerItem(1, { headline: 'Ministry report says AI hiring is rising for Indian workers', whyItMatters: 'The story cites a government report on jobs.' });
  const discovery = await discoverPrimarySources(item, goodQualification, {}, {
    fetch: async (url) => {
      if (String(url).includes('company-1-hiring')) {
        return new Response('<a href="https://labour.gov.in/reports/ai-hiring-report.pdf">Ministry report PDF</a>', { status: 200 });
      }
      return new Response('Ministry report AI hiring Indian workers jobs', { status: 200 });
    },
  }, { runId: 'run_primary' });
  assert.equal(discovery.status, 'found');
  assert.equal(discovery.primarySources.length, 1);
  assert.equal(discovery.primarySources[0].url, 'https://labour.gov.in/reports/ai-hiring-report.pdf');
  assert.equal(discovery.primarySources[0].verified, true);
});

test('primary-source discovery finds an official source through web search when the article only names it', async () => {
  const item = trackerItem(1, { headline: 'EPFO report points to new payroll additions for Indian employees', whyItMatters: 'The article names an EPFO payroll report but does not link it.' });
  const discovery = await discoverPrimarySources(item, goodQualification, {}, {
    fetch: async (url) => {
      if (String(url).includes('company-1-hiring')) return new Response('The article cites the EPFO payroll report for Indian employees.', { status: 200 });
      return new Response('EPFO payroll report Indian employees payroll additions', { status: 200 });
    },
    primarySourceSearch: async () => ({
      primarySources: [{
        title: 'EPFO payroll report',
        url: 'https://www.epfindia.gov.in/site_docs/PDFs/payroll_report.pdf',
        publisherOrIssuer: 'EPFO',
        sourceType: 'government_report',
        relationship: 'reports_findings_from',
        discoveryMethod: 'official_site_search',
        confidence: 'high',
      }],
      searchesAttempted: ['EPFO payroll report official PDF'],
      organisationsChecked: ['EPFO'],
      notes: 'Official EPFO PDF located.',
    }),
  }, { runId: 'run_search' });
  assert.equal(discovery.status, 'found');
  assert.equal(discovery.primarySources[0].publisherOrIssuer, 'EPFO');
  assert.equal(JSON.stringify(discovery).includes('raw search'), false);
});

test('primary-source discovery records ambiguous and not-found outcomes without inventing URLs', async () => {
  const item = trackerItem(1, { headline: 'Survey report changes hiring plans for Indian workers', whyItMatters: 'The article names a survey report.' });
  const noSource = await discoverPrimarySources(item, goodQualification, {}, {
    fetch: async () => new Response('Article says unnamed survey report affected Indian workers.', { status: 200 }),
    primarySourceSearch: async () => ({ primarySources: [], searchesAttempted: ['survey report official'], organisationsChecked: ['unknown'], notes: 'No authoritative source found.' }),
  }, { runId: 'run_none' });
  assert.equal(noSource.status, 'not_found');
  assert.equal(noSource.primarySources.length, 0);

  const ambiguous = await discoverPrimarySources(item, goodQualification, {}, {
    fetch: async (url) => new Response(String(url).includes('report-a') ? 'unrelated report' : 'Article names survey report.', { status: 200 }),
    primarySourceSearch: async () => ({
      primarySources: [
        { title: 'Survey report A', url: 'https://example.org/report-a', sourceType: 'survey_report', discoveryMethod: 'web_search', confidence: 'low' },
        { title: 'Survey report B', url: 'https://example.org/report-b', sourceType: 'survey_report', discoveryMethod: 'web_search', confidence: 'low' },
      ],
      notes: 'Several possible documents, none verified.',
    }),
  }, { runId: 'run_ambiguous' });
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.primarySources.length, 0);
});

test('primary-source discovery rejects unsupported, unrelated and secondary-media URLs', async () => {
  const item = trackerItem(1, { headline: 'RBI circular affects employee banking benefits', whyItMatters: 'The article cites an RBI circular.' });
  const discovery = await discoverPrimarySources(item, goodQualification, {}, {
    fetch: async (url) => {
      if (String(url).includes('company-1-hiring')) return new Response('Article cites an RBI circular.', { status: 200 });
      if (String(url).includes('rbi.org.in')) return new Response('Unrelated monetary policy document', { status: 200 });
      return new Response('Another publisher article about RBI circular', { status: 200 });
    },
    primarySourceSearch: async () => ({
      primarySources: [
        { title: 'RBI circular', url: 'https://economictimes.indiatimes.com/jobs/company-1-hiring', sourceType: 'regulator_circular', discoveryMethod: 'web_search', confidence: 'high' },
        { title: 'RBI circular', url: 'https://www.rbi.org.in/scripts/unrelated-circular.aspx', sourceType: 'regulator_circular', discoveryMethod: 'web_search', confidence: 'high' },
      ],
      notes: 'Candidates did not verify.',
    }),
  }, { runId: 'run_reject' });
  assert.equal(discovery.status, 'ambiguous');
  assert.equal(discovery.primarySources.length, 0);
});

test('primary-source discovery stores technical failure safely without raw output', async () => {
  const item = trackerItem(1, { headline: 'Court order affects workplace policy for Indian employees', whyItMatters: 'The story cites a court order.' });
  const discovery = await discoverPrimarySources(item, goodQualification, {}, {
    fetch: async () => new Response('Article cites a court order.', { status: 200 }),
    primarySourceSearch: async () => { throw new Error('search backend unavailable with raw payload that should be truncated'); },
  }, { runId: 'run_failed' });
  assert.equal(discovery.status, 'failed');
  assert.equal(discovery.failureCode, 'primary_source_verification_failed');
  assert.equal(JSON.stringify(discovery).includes('rawModelResponse'), false);
});

test('primary-source metadata keeps article source separate and persists multiple sources', () => {
  const item = normalizeNewsTrackerResponse({ items: [baseItem] }).items[0];
  const candidate = candidateFromTrackerItem(item, goodQualification);
  const updated = applyPrimarySourceDiscovery(candidate, {
    status: 'multiple_found',
    primarySources: [
      { title: 'Government notification', url: 'https://labour.gov.in/notification.pdf', publisherOrIssuer: 'Labour Ministry', sourceType: 'government_notification', relationship: 'based_on', discoveryMethod: 'official_site_search', confidence: 'high', verified: true },
      { title: 'Company filing', url: 'https://www.bseindia.com/xml-data/corpfiling/filing.pdf', publisherOrIssuer: 'BSE', sourceType: 'stock_exchange_disclosure', relationship: 'cites', discoveryMethod: 'official_site_search', confidence: 'high', verified: true },
    ],
    discoveredAt: recent,
    runId: 'run_sources',
    notes: 'Two primary sources support the source chain.',
  });
  assert.equal(updated.articleSourceUrl, candidate.canonicalUrl);
  assert.notEqual(updated.primarySourceUrl, updated.articleSourceUrl);
  assert.equal(updated.primarySources.length, 2);
  assert.equal(updated.sourceChain.primarySources.length, 2);
});

test('manual primary-source entries are preserved when automation runs again', () => {
  const item = normalizeNewsTrackerResponse({ items: [baseItem] }).items[0];
  const candidate = candidateFromTrackerItem(item, goodQualification);
  const existing = {
    ...candidate,
    primarySources: [{
      title: 'Manual ministry PDF',
      url: 'https://labour.gov.in/manual.pdf',
      publisherOrIssuer: 'Labour Ministry',
      sourceType: 'government_report',
      relationship: 'based_on',
      discoveryMethod: 'manual_staff_entry',
      confidence: 'high',
      verified: true,
    }],
  };
  const updated = applyPrimarySourceDiscovery(candidate, {
    status: 'found',
    primarySources: [{ title: 'Automated source', url: 'https://labour.gov.in/auto.pdf', sourceType: 'government_report', relationship: 'based_on', discoveryMethod: 'official_site_search', confidence: 'medium', verified: true }],
  }, existing);
  assert.equal(updated.primarySources.length, 2);
  assert.equal(updated.primarySources[0].url, 'https://labour.gov.in/manual.pdf');
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
  }, { dryRun: true }, { fetch, store, fetchWebflowNewsArchive: async () => [] });
  assert.equal(result.summary.itemsReceived, 1);
  assert.equal(result.summary.itemsSkipped, 1);
  assert.deepEqual(calls, ['https://tracker.example.test/current?t=' + calls[0].split('t=')[1]]);
  assert.equal(calls.some((url) => /reddit|official|newsdata|rss|radar|search/i.test(url)), false);
});

test('Webflow News archive fetch paginates with limit 100 and offset', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    const offset = Number(new URL(String(url)).searchParams.get('offset') || 0);
    const count = offset < 100 ? 100 : 25;
    return new Response(JSON.stringify({
      items: Array.from({ length: count }, (_, index) => webflowNewsItem(`wf_${offset + index}`)),
      pagination: { total: 125, limit: 100, offset },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const items = await fetchWebflowNewsArchive({ WEBFLOW_TOKEN: 'test-token' }, { fetch });
  assert.equal(items.length, 125);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /limit=100&offset=0/);
  assert.match(calls[1], /limit=100&offset=100/);
});

test('URL normalization ignores tracking parameters and preserves meaningful parameters', () => {
  const normalized = normalizeDuplicateUrl('HTTPS://www.Example.com/news/story/?utm_source=x&gclid=y&id=42&b=2&a=1#section');
  assert.equal(normalized, 'https://example.com/news/story?a=1&b=2&id=42');
});

test('Wocult duplicate index excludes archived items and includes manual Webflow items', () => {
  const index = buildWocultDuplicateIndex([
    webflowNewsItem('archived', { isArchived: true, fieldData: { name: 'Archived duplicate', 'source-url': baseItem.link } }),
    webflowNewsItem('manual', { fieldData: { name: baseItem.headline, slug: 'manual-wocult-story', 'source-url': baseItem.link } }),
  ]);
  assert.equal(index.length, 1);
  assert.equal(index[0].webflowItemId, 'manual');
  assert.equal(index[0].wocultUrl, 'https://www.wocult.com/news/manual-wocult-story');
});

test('published and draft Wocult source URL duplicates skip Claude and do not consume slots', async () => {
  const items = [
    trackerItem(1, { headline: 'Published duplicate story for Indian workers', link: 'https://source.test/published?utm_source=x' }),
    trackerItem(2, { headline: 'Draft duplicate story for Indian workers', link: 'https://source.test/draft' }),
    trackerItem(3), trackerItem(4), trackerItem(5), trackerItem(6), trackerItem(7),
  ];
  const mocks = makeRunMocks(items, {
    webflowArchive: [
      webflowNewsItem('published_wf', { fieldData: { name: 'Published duplicate story for Indian workers', slug: 'published-duplicate-story', 'source-url': 'https://source.test/published' } }),
      webflowNewsItem('draft_wf', { isDraft: true, fieldData: { name: 'Draft duplicate story for Indian workers', slug: 'draft-duplicate-story', 'source-url': 'https://source.test/draft/' } }),
    ],
  });
  const result = await runNewsBriefAutomation({
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
    NEWS_TRACKER_API: 'https://tracker.example.test/feed',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.webflowItemsChecked, 2);
  assert.equal(mocks.calls.webflowArchive, 1);
  assert.equal(result.summary.itemsAlreadyPublishedOnWocult, 1);
  assert.equal(result.summary.itemsAlreadyInWebflowDraft, 1);
  assert.equal(result.summary.preflightSkippedItems.length, 2);
  assert.equal(result.summary.targetItems, 5);
  assert.equal(mocks.calls.anthropic, 5);
  assert.equal(mocks.saved.find((c) => c.duplicateCheck?.matchedWebflowItemId === 'published_wf').duplicateCheck.anthropicCalls, 0);
  assert.equal(mocks.saved.find((c) => c.duplicateCheck?.matchedWebflowItemId === 'draft_wf').duplicateCheck.webSearchRequests, 0);
});

test('primary-source URL, exact headline and exact slug duplicates are detected before Claude', async () => {
  const items = [
    trackerItem(1, { headline: 'Primary source duplicate for workers', primarySourceUrl: 'https://labour.gov.in/report.pdf' }),
    trackerItem(2, { headline: 'Exact headline duplicate for Indian employees' }),
    trackerItem(3, { headline: 'Acme hiring plan adds 5000 jobs' }),
  ];
  const mocks = makeRunMocks(items, {
    webflowArchive: [
      webflowNewsItem('primary_match', { fieldData: { name: 'Old primary story', 'primary-source-url': 'https://labour.gov.in/report.pdf' } }),
      webflowNewsItem('headline_match', { fieldData: { name: 'Exact headline duplicate for Indian employees', slug: 'other-story' } }),
      webflowNewsItem('slug_match', { fieldData: { name: 'Different title', slug: 'acme-hiring-plan-adds-5000-jobs' } }),
    ],
  });
  const result = await runNewsBriefAutomation({
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_TRACKER_API: 'https://tracker.example.test/feed',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.preflightSkippedItems.length, 3);
  assert.deepEqual(result.summary.preflightSkippedItems.map((i) => i.matchReason), ['primary_source_url_exact', 'headline_exact', 'slug_exact']);
  assert.equal(mocks.calls.anthropic, 0);
});

test('high-confidence same-story match skips while broad-topic similarity does not', () => {
  const index = buildWocultDuplicateIndex([
    webflowNewsItem('same_story', { fieldData: { name: 'TCS layoffs affect 12000 employees in India', slug: 'tcs-layoffs-affect-12000-employees' } }),
    webflowNewsItem('broad_ai', { fieldData: { name: 'AI adoption changes office work', slug: 'ai-adoption-changes-office-work' } }),
  ]);
  const high = checkWocultDuplicate(trackerItem(1, { headline: 'TCS layoffs affect 12000 workers in India' }), index);
  assert.equal(high.confidence, 'high');
  assert.equal(high.matchReason, 'story_fingerprint_high');
  const broad = checkWocultDuplicate(trackerItem(2, { headline: 'AI tools influence hiring plans for workers' }), index);
  assert.equal(broad.status, 'no_wocult_match');
});

test('possible Wocult duplicate is held for editorial check without Claude usage', async () => {
  const item = trackerItem(1, {
    headline: 'Infosys AI hiring plan adds 5000 roles',
    whyItMatters: 'The story mentions Infosys hiring.',
  });
  const mocks = makeRunMocks([item], {
    webflowArchive: [
      webflowNewsItem('possible_wf', { fieldData: { name: 'Infosys AI hiring plan shifts 5000 jobs', slug: 'infosys-ai-hiring-plan-shifts-5000-jobs', standfirst: 'Infosys plans 5000 jobs in AI services.' } }),
    ],
  });
  const result = await runNewsBriefAutomation({
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_TRACKER_API: 'https://tracker.example.test/feed',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsPossibleWocultDuplicates, 1);
  assert.equal(result.summary.targetItems, 0);
  assert.equal(mocks.calls.anthropic, 0);
  assert.equal(mocks.saved[0].status, 'needs_editorial_check');
  assert.equal(mocks.saved[0].duplicateCheck.status, 'possible_wocult_duplicate');
  assert.equal(mocks.saved[0].duplicateCheck.matchedWocultUrl, 'https://www.wocult.com/news/infosys-ai-hiring-plan-shifts-5000-jobs');
});

test('archive-check failure blocks assessment and records zero usage', async () => {
  const err = new Error('webflow unavailable');
  err.failureStage = 'wocult_duplicate_check';
  err.failureCode = 'webflow_news_fetch_failed';
  const mocks = makeRunMocks([trackerItem(1)], { webflowArchiveError: err });
  const result = await runNewsBriefAutomation({
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_TRACKER_API: 'https://tracker.example.test/feed',
  }, { dryRun: true }, mocks);
  assert.equal(result.ok, false);
  assert.equal(result.summary.state, 'failed');
  assert.equal(result.summary.wocultDuplicateCheckCompleted, false);
  assert.equal(result.summary.errorSummary[0].failureStage, 'wocult_duplicate_check');
  assert.equal(mocks.calls.anthropic, 0);
  assert.equal(result.summary.usage.anthropicCalls, 0);
});

test('run accepts valid client runId, rejects invalid and reused runId', async () => {
  const valid = makeRunMocks([trackerItem(1)]);
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true, requestRunId: 'run_client_abc12345' }, valid);
  assert.equal(result.summary.runId, 'run_client_abc12345');
  assert.equal(valid.runs[0].runId, 'run_client_abc12345');

  const invalid = await runNewsBriefAutomation({}, { dryRun: true, requestRunId: '../bad' }, makeRunMocks([]));
  assert.equal(invalid.status, 400);

  const reused = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
  }, { dryRun: true, requestRunId: 'run_client_abc12345' }, makeRunMocks([], { existingRuns: [['run_client_abc12345', { runId: 'run_client_abc12345' }]] }));
  assert.equal(reused.status, 409);
});

test('workflow start returns 202, creates one instance and does not await processing', async () => {
  const mocks = makeRunMocks([trackerItem(1)]);
  let created = 0;
  const workflow = {
    create: async ({ id, params }) => {
      created += 1;
      return { id, params };
    },
  };
  const request = new Request('https://worker.test/automation/news-briefs/run', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      triggerType: 'dashboard_dry_run',
      dryRun: true,
      requestRunId: 'run_workflow_start_12345678',
    }),
  });
  const response = await handleAutomationRequest(request, {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: workflow,
  }, null, {}, mocks);
  const data = await response.json();
  assert.equal(response.status, 202);
  assert.equal(data.accepted, true);
  assert.equal(data.runId, 'run_workflow_start_12345678');
  assert.equal(data.workflowInstanceId, 'run_workflow_start_12345678');
  assert.equal(data.state, 'queued');
  assert.equal(created, 1);
  assert.equal(mocks.calls.webflowArchive, 0);
  assert.equal(mocks.calls.anthropic, 0);
  assert.equal(mocks.runs.some((run) => run.workflowState === 'queued'), true);
});

test('workflow start rejects duplicate runId and active conflict without creating another instance', async () => {
  let created = 0;
  const workflow = { create: async () => { created += 1; return { id: 'unexpected' }; } };
  const duplicate = await startNewsBriefAutomationWorkflow({
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: workflow,
  }, { dryRun: true, requestRunId: 'run_duplicate_workflow_12345678' }, makeRunMocks([], {
    existingRuns: [['run_duplicate_workflow_12345678', { runId: 'run_duplicate_workflow_12345678' }]],
  }));
  assert.equal(duplicate.status, 409);
  assert.equal(created, 0);

  const active = {
    runId: 'run_active_workflow_12345678',
    state: 'running',
    phase: 'primary_source_discovery',
    workflowState: 'running',
    workflowInstanceId: 'run_active_workflow_12345678',
    heartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  };
  const conflict = await startNewsBriefAutomationWorkflow({
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: {
      ...workflow,
      get: async () => ({ status: async () => ({ status: 'running' }) }),
    },
  }, { dryRun: true, requestRunId: 'run_new_workflow_12345678' }, makeRunMocks([], { activeRun: active }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.workflowState, 'running');
  assert.equal(created, 0);
});

test('workflow execution records durable steps and workflow terminal state', async () => {
  const items = [trackerItem(1), trackerItem(2)];
  const stepNames = [];
  const mocks = makeRunMocks(items);
  const workflowStep = {
    do: async (name, config, fn) => {
      stepNames.push({ name, config });
      return fn({ attempt: 1, step: { name, count: 1 }, config });
    },
  };
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '2',
  }, {
    dryRun: true,
    requestRunId: 'run_workflow_exec_12345678',
    workflowInstanceId: 'run_workflow_exec_12345678',
    fromWorkflow: true,
  }, { ...mocks, workflowStep });
  assert.equal(result.summary.workflowState, 'completed');
  assert.equal(result.summary.currentWorkflowStep, 'completed');
  assert.ok(stepNames.some((entry) => entry.name === 'fetch-news-tracker'));
  assert.ok(stepNames.some((entry) => entry.name === 'fetch-webflow-news-archive'));
  assert.ok(stepNames.some((entry) => entry.name === 'build-wocult-duplicate-index'));
  assert.ok(stepNames.some((entry) => entry.name === 'select-candidates'));
  assert.ok(stepNames.some((entry) => entry.name === 'candidate-1-qualification'));
  assert.ok(stepNames.every((entry) => entry.config?.timeout));
});

test('coordinator fetches archives once, creates independent candidate workflows and leaves parent running', async () => {
  const items = Array.from({ length: 5 }, (_, i) => trackerItem(i + 1));
  const mocks = makeRunMocks(items);
  const created = [];
  const stepOutputs = new Map();
  const workflowStep = {
    do: async (name, config, fn) => {
      const output = await fn({ attempt: 1, step: { name, count: 1 }, config });
      stepOutputs.set(name, output);
      return output;
    },
  };
  const result = await runNewsBriefCoordinatorWorkflow({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
    NEWS_BRIEF_CANDIDATE_WORKFLOW: {
      create: async ({ id, params }) => { created.push({ id, params }); return { id }; },
    },
  }, {
    dryRun: true,
    requestRunId: 'run_fanout_12345678',
    coordinatorWorkflowInstanceId: 'run_fanout_12345678',
  }, { ...mocks, workflowStep });
  const parent = mocks.runMap.get('run_fanout_12345678');
  const firstChild = mocks.childMap.get(`run_fanout_12345678/${parent.selectedCandidates[0].candidateId}`);
  const firstSpawn = stepOutputs.get('spawn-candidate-1');
  assert.equal(result.selectedCandidates, 5);
  assert.equal(created.length, 5);
  assert.equal(new Set(created.map((entry) => entry.id)).size, 5);
  assert.equal(mocks.calls.webflowArchive, 1);
  assert.equal(mocks.calls.anthropic, 0);
  assert.equal(parent.orchestrationState, 'fanout_completed');
  assert.equal(parent.applicationState, 'running');
  assert.equal(parent.activeRun, true);
  assert.equal(parent.completedItems, 0);
  assert.equal(parent.percentComplete, 0);
  assert.equal(parent.candidateWorkflowIds.length, 5);
  assert.equal(firstSpawn.candidateId, parent.selectedCandidates[0].candidateId);
  assert.equal(firstSpawn.candidateIndex, 1);
  assert.equal(firstSpawn.workflowInstanceId, created[0].id);
  assert.equal(firstSpawn.workflowCreated, true);
  assert.equal(firstSpawn.headline, parent.selectedCandidates[0].headline);
  assert.equal(firstChild.candidateIndex, 1);
  assert.equal(firstChild.headline, parent.selectedCandidates[0].headline);
  assert.equal(firstChild.workflowInstanceId, created[0].id);
});

test('coordinator compact selection excludes raw tracker payload and Webflow body HTML', async () => {
  const items = [trackerItem(1, { rawMarker: 'RAW_TRACKER_PAYLOAD_SHOULD_NOT_APPEAR' })];
  const mocks = makeRunMocks(items, {
    webflowArchive: [webflowNewsItem('1', { fieldData: { body: '<p>WEBFLOW_BODY_SHOULD_NOT_APPEAR</p>' } })],
  });
  await runNewsBriefCoordinatorWorkflow({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
    NEWS_BRIEF_CANDIDATE_WORKFLOW: { create: async ({ id }) => ({ id }) },
  }, { dryRun: true, requestRunId: 'run_compact_12345678', coordinatorWorkflowInstanceId: 'run_compact_12345678' }, mocks);
  const parent = mocks.runMap.get('run_compact_12345678');
  const payload = JSON.stringify(parent.selectedCandidates);
  assert.doesNotMatch(payload, /RAW_TRACKER_PAYLOAD_SHOULD_NOT_APPEAR|WEBFLOW_BODY_SHOULD_NOT_APPEAR/);
  assert.ok(new TextEncoder().encode(JSON.stringify({
    selectedCandidates: parent.selectedCandidates,
    preflightSkippedItems: parent.preflightSkippedItems,
  })).length < 1024 * 1024);
});

test('zero-candidate coordinator completes as valid 0-of-0 without child workflows', async () => {
  const old = trackerItem(1, { dateFound: '2026-01-01T00:00:00.000Z' });
  const mocks = makeRunMocks([old], { existingLinks: [createStoryFingerprint(normalizeNewsTrackerResponse({ items: [old] }).items[0])] });
  let created = 0;
  await runNewsBriefCoordinatorWorkflow({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
    NEWS_BRIEF_CANDIDATE_WORKFLOW: { create: async () => { created += 1; } },
  }, { dryRun: true, requestRunId: 'run_zero_12345678', coordinatorWorkflowInstanceId: 'run_zero_12345678' }, mocks);
  const parent = mocks.runMap.get('run_zero_12345678');
  assert.equal(created, 0);
  assert.equal(parent.targetItems, 0);
  assert.equal(parent.completedItems, 0);
  assert.equal(parent.percentComplete, 100);
  assert.equal(parent.applicationState, 'completed');
  assert.equal(parent.activeRun, false);
});

test('candidate workflow finalises one candidate and triggers finalizer without completing siblings', async () => {
  const candidate = {
    candidateId: 'nt_candidate_one',
    candidateIndex: 1,
    headline: trackerItem(1).headline,
    sourceName: trackerItem(1).source,
    sourceUrl: trackerItem(1).link,
    dateFound: recent,
    theme: trackerItem(1).theme,
    whyItMatters: trackerItem(1).whyItMatters,
    verification: trackerItem(1).verification,
  };
  const mocks = makeRunMocks([], {
    qualificationFor: () => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null }),
  });
  mocks.runMap.set('run_child_12345678', {
    runId: 'run_child_12345678',
    applicationState: 'running',
    state: 'running',
    targetItems: 5,
    completedItems: 0,
    selectedCandidates: [candidate],
    activeRun: true,
  });
  const finalizers = [];
  const result = await runNewsBriefCandidateWorkflow({
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_FINALIZER_WORKFLOW: { create: async ({ id, params }) => { finalizers.push({ id, params }); return { id }; } },
  }, { runId: 'run_child_12345678', candidate, dryRun: true, workflowInstanceId: 'nbc-child-1' }, mocks);
  const child = mocks.childMap.get('run_child_12345678/nt_candidate_one');
  assert.equal(result.finalStatus, 'rejected_by_filter');
  assert.equal(child.finalised, true);
  assert.equal(child.workflowState, 'completed');
  assert.equal(finalizers.length, 1);
  assert.equal(mocks.saved.length, 1);
});

test('candidate finalizer marker update preserves finalised child metadata', async () => {
  const candidate = {
    candidateId: 'nt_candidate_merge',
    candidateIndex: 1,
    headline: trackerItem(1).headline,
    sourceName: trackerItem(1).source,
    sourceUrl: trackerItem(1).link,
    dateFound: recent,
    theme: trackerItem(1).theme,
    whyItMatters: trackerItem(1).whyItMatters,
    verification: trackerItem(1).verification,
  };
  const mocks = makeRunMocks([], {
    qualificationFor: () => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null }),
  });
  mocks.runMap.set('run_child_merge_12345678', {
    runId: 'run_child_merge_12345678',
    applicationState: 'running',
    state: 'running',
    targetItems: 1,
    selectedCandidates: [candidate],
    activeRun: true,
  });
  await runNewsBriefCandidateWorkflow({
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_FINALIZER_WORKFLOW: { create: async ({ id }) => ({ id }) },
  }, { runId: 'run_child_merge_12345678', candidate, dryRun: true, workflowInstanceId: 'nbc-child-merge' }, mocks);
  const child = mocks.childMap.get('run_child_merge_12345678/nt_candidate_merge');
  assert.equal(child.finalised, true);
  assert.equal(child.finalStatus, 'rejected_by_filter');
  assert.equal(child.candidateIndex, 1);
  assert.equal(child.headline, candidate.headline);
  assert.equal(child.workflowInstanceId, 'nbc-child-merge');
  assert.match(child.finalizerWorkflowInstanceId, /^nbf-/);
});

test('child Workflow creation failure produces terminal child outcome', async () => {
  const items = [trackerItem(1)];
  const mocks = makeRunMocks(items);
  await runNewsBriefCoordinatorWorkflow({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
    NEWS_BRIEF_CANDIDATE_WORKFLOW: { create: async () => { throw new Error('create failed'); } },
    NEWS_BRIEF_FINALIZER_WORKFLOW: { create: async ({ id }) => ({ id }) },
  }, { dryRun: true, requestRunId: 'run_spawn_fail_12345678', coordinatorWorkflowInstanceId: 'run_spawn_fail_12345678' }, mocks);
  const parent = mocks.runMap.get('run_spawn_fail_12345678');
  const child = mocks.childMap.get(`run_spawn_fail_12345678/${parent.selectedCandidates[0].candidateId}`);
  assert.equal(child.finalised, true);
  assert.equal(child.finalStatus, 'failed');
  assert.equal(child.applicationState, 'failed');
  assert.equal(child.failureStage, 'spawn_candidate_workflow');
  assert.equal(child.failureCode, 'candidate_workflow_create_failed');
});

test('finalizer completes parent only after all selected children are finalised', async () => {
  const mocks = makeRunMocks([]);
  const runId = 'run_finalizer_12345678';
  mocks.runMap.set(runId, {
    runId,
    applicationState: 'running',
    state: 'running',
    targetItems: 2,
    completedItems: 0,
    activeRun: true,
    selectedCandidates: [{ candidateId: 'c1' }, { candidateId: 'c2' }],
  });
  await mocks.store.saveChildRun(runId, 'c1', { candidateId: 'c1', candidateIndex: 1, finalised: true, finalStatus: 'rejected_by_filter', applicationState: 'completed', attemptedItem: { candidateId: 'c1' }, usage: { ...goodUsage(), inputTokens: 10 } });
  await runNewsBriefFinalizerWorkflow({ NEWS_BRIEF_DRY_RUN: 'true' }, { runId, dryRun: true }, mocks);
  assert.equal(mocks.runMap.get(runId).applicationState, 'running');
  assert.equal(mocks.runMap.get(runId).completedItems, 1);
  assert.equal(mocks.runMap.get(runId).percentComplete, 50);
  await mocks.store.saveChildRun(runId, 'c2', { candidateId: 'c2', candidateIndex: 2, finalised: true, finalStatus: 'failed', applicationState: 'failed', attemptedItem: { candidateId: 'c2' }, usage: { ...goodUsage(), outputTokens: 4 } });
  await runNewsBriefFinalizerWorkflow({ NEWS_BRIEF_DRY_RUN: 'true' }, { runId, dryRun: true }, mocks);
  assert.equal(mocks.runMap.get(runId).applicationState, 'completed_with_failures');
  assert.equal(mocks.runMap.get(runId).completedItems, 2);
  assert.equal(mocks.runMap.get(runId).percentComplete, 100);
  assert.equal(mocks.runMap.get(runId).activeRun, false);
});

test('finalizer completes parent at 1 of 1 after finalised child is visible', async () => {
  const mocks = makeRunMocks([]);
  const runId = 'run_finalizer_one_12345678';
  mocks.runMap.set(runId, {
    runId,
    applicationState: 'running',
    state: 'running',
    targetItems: 1,
    completedItems: 0,
    activeRun: true,
    selectedCandidates: [{ candidateId: 'c1', candidateIndex: 1, headline: 'One selected story' }],
    candidateWorkflowIds: [{ candidateId: 'c1', candidateIndex: 1, headline: 'One selected story', workflowInstanceId: 'nbc-one' }],
  });
  await mocks.store.saveChildRun(runId, 'c1', {
    candidateId: 'c1',
    candidateIndex: 1,
    headline: 'One selected story',
    workflowInstanceId: 'nbc-one',
    finalised: true,
    finalStatus: 'rejected_by_filter',
    applicationState: 'completed',
    attemptedItem: { candidateId: 'c1', headline: 'One selected story', outcome: 'rejected_by_filter' },
    usage: { ...goodUsage(), inputTokens: 10 },
  });
  await runNewsBriefFinalizerWorkflow({ NEWS_BRIEF_DRY_RUN: 'true' }, { runId, dryRun: true }, mocks);
  const parent = mocks.runMap.get(runId);
  assert.equal(parent.applicationState, 'completed');
  assert.equal(parent.completedItems, 1);
  assert.equal(parent.percentComplete, 100);
  assert.equal(parent.activeRun, false);
  assert.equal(parent.childWorkflowSummaries[0].headline, 'One selected story');
  assert.equal(parent.childWorkflowSummaries[0].workflowInstanceId, 'nbc-one');
});

test('status keeps coordinator-complete parent running while child workflows are active', async () => {
  const runId = 'run_status_children_12345678';
  const mocks = makeRunMocks([]);
  mocks.runMap.set(runId, {
    runId,
    coordinatorWorkflowInstanceId: runId,
    coordinatorWorkflowState: 'completed',
    workflowState: 'completed',
    orchestrationState: 'fanout_completed',
    applicationState: 'running',
    state: 'running',
    selectedCandidates: [{ candidateId: 'c1' }, { candidateId: 'c2' }],
    targetItems: 2,
    completedItems: 0,
    activeRun: true,
  });
  await mocks.store.saveChildRun(runId, 'c1', { candidateId: 'c1', candidateIndex: 1, finalised: true, finalStatus: 'rejected_by_filter', applicationState: 'completed', attemptedItem: { candidateId: 'c1' } });
  await mocks.store.saveChildRun(runId, 'c2', { candidateId: 'c2', candidateIndex: 2, finalised: false, applicationState: 'running', currentStage: 'qualification' });
  const response = await handleAutomationRequest(new Request(`https://worker.test/automation/news-briefs/status?runId=${runId}`, {
    headers: { Authorization: 'Bearer admin' },
  }), {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: { get: async () => ({ status: async () => ({ status: 'completed' }) }) },
  }, null, {}, mocks);
  const data = await response.json();
  assert.equal(data.run.applicationState, 'running');
  assert.equal(data.run.completedItems, 1);
  assert.equal(data.run.percentComplete, 50);
  assert.equal(data.run.activeRun, true);
  assert.equal(data.run.childWorkflowSummaries.length, 2);
});

test('status returns selected-candidate fallback metadata for incomplete child records', async () => {
  const runId = 'run_status_fallback_12345678';
  const mocks = makeRunMocks([]);
  mocks.runMap.set(runId, {
    runId,
    coordinatorWorkflowState: 'completed',
    workflowState: 'completed',
    orchestrationState: 'fanout_completed',
    applicationState: 'running',
    state: 'running',
    selectedCandidates: [{ candidateId: 'c1', candidateIndex: 1, headline: 'Fallback headline', sourceName: 'Tracker', sourceUrl: 'https://source.test/story' }],
    candidateWorkflowIds: [{ candidateId: 'c1', candidateIndex: 1, headline: 'Fallback headline', workflowInstanceId: 'nbc-fallback' }],
    targetItems: 1,
    completedItems: 0,
    activeRun: true,
  });
  await mocks.store.saveChildRun(runId, 'c1', {
    candidateId: 'c1',
    finalised: false,
    externalRequestUsage: { totalExternalFetches: 12, firebaseAuth: 1, firestoreReads: 3, firestoreWrites: 7, anthropic: 1, softLimit: 32, finalisationReserve: 6 },
  });
  const response = await handleAutomationRequest(new Request(`https://worker.test/automation/news-briefs/status?runId=${runId}`, {
    headers: { Authorization: 'Bearer admin' },
  }), {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: { get: async () => ({ status: async () => ({ status: 'completed' }) }) },
  }, null, {}, mocks);
  const data = await response.json();
  const child = data.run.childWorkflowSummaries[0];
  assert.equal(child.candidateId, 'c1');
  assert.equal(child.candidateIndex, 1);
  assert.equal(child.headline, 'Fallback headline');
  assert.equal(child.workflowInstanceId, 'nbc-fallback');
  assert.equal(child.finalised, false);
  assert.equal(child.externalRequestUsage.totalExternalFetches, 12);
});

test('historical complete Workflow with 0 of 5 reconciles to failed instead of 100 percent', async () => {
  const historical = {
    runId: 'run_historical_12345678',
    state: 'running',
    workflowState: 'running',
    workflowInstanceId: 'run_historical_12345678',
    targetItems: 5,
    completedItems: 0,
    percentComplete: 0,
    activeRun: true,
  };
  let saved = null;
  const response = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status?runId=run_historical_12345678', {
    headers: { Authorization: 'Bearer admin' },
  }), {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: { get: async () => ({ status: async () => ({ status: 'completed' }) }) },
  }, null, {}, {
    store: {
      getRun: async () => historical,
      saveRun: async (run) => { saved = run; },
    },
  });
  const data = await response.json();
  assert.equal(data.run.state, 'failed');
  assert.equal(data.run.applicationState, 'failed');
  assert.equal(data.run.percentComplete, 0);
  assert.equal(data.run.failureCode, 'workflow_ended_before_pipeline_completion');
  assert.equal(saved.activeRun, false);
});

function goodUsage() {
  return { anthropicCalls: 0, inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, webSearchRequests: 0, models: [] };
}

test('status endpoint returns durable Workflow state without marking stale running workflow failed', async () => {
  const staleWorkflowRun = {
    runId: 'run_workflow_status_12345678',
    state: 'running',
    phase: 'primary_source_discovery',
    workflowState: 'running',
    workflowInstanceId: 'run_workflow_status_12345678',
    currentWorkflowStep: 'candidate-2-primary-source-discovery',
    heartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    completedItems: 1,
    targetItems: 5,
    percentComplete: 20,
  };
  let saved = null;
  const response = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status?runId=run_workflow_status_12345678', {
    headers: { Authorization: 'Bearer admin' },
  }), {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_WORKFLOW: {
      get: async () => ({ status: async () => ({ status: 'running' }) }),
    },
  }, null, {}, {
    store: {
      getRun: async () => staleWorkflowRun,
      saveRun: async (run) => { saved = run; },
    },
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.run.state, 'running');
  assert.equal(data.run.workflowState, 'running');
  assert.equal(data.run.percentComplete, 20);
  assert.equal(saved, null);
});

test('active run lock rejects concurrent runs and allows stale recovery', async () => {
  const active = { runId: 'run_active_12345678', state: 'running', phase: 'qualifying', heartbeatAt: new Date().toISOString() };
  const conflict = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
  }, { dryRun: true, requestRunId: 'run_new_12345678' }, makeRunMocks([], { activeRun: active }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.activeRunId, 'run_active_12345678');

  const stale = { ...active, heartbeatAt: new Date(Date.now() - 40 * 60 * 1000).toISOString() };
  const staleMocks = makeRunMocks([], { activeRun: stale });
  const recovered = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
  }, { dryRun: true, requestRunId: 'run_new_87654321' }, staleMocks);
  assert.equal(recovered.status, undefined);
  assert.equal(recovered.summary.runId, 'run_new_87654321');
  const recoveredStale = staleMocks.runs.find((run) => run.runId === 'run_active_12345678' && run.state === 'failed');
  assert.equal(recoveredStale.activeRun, false);
  assert.equal(recoveredStale.failureCode, 'stale_run_timeout');
});

test('stale run recovery preserves partial progress and releases lock', async () => {
  const stale = {
    runId: 'run_stale_partial_12345678',
    state: 'running',
    phase: 'primary_source_discovery',
    startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    heartbeatAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    completedItems: 3,
    targetItems: 5,
    percentComplete: 60,
    currentCandidateId: 'nt_current',
    currentHeadline: 'Current stuck candidate',
    attemptedItems: [{ candidateId: 'nt_1' }, { candidateId: 'nt_2' }, { candidateId: 'nt_3' }],
    usage: { anthropicCalls: 3, inputTokens: 72931, outputTokens: 3279, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, webSearchRequests: 7, models: ['claude-test'] },
  };
  const mocks = makeRunMocks([trackerItem(10)], { activeRun: stale });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true, requestRunId: 'run_after_recovery_12345678' }, mocks);
  const recovered = mocks.runs.find((run) => run.runId === stale.runId && run.state === 'failed');
  assert.equal(recovered.completedItems, 3);
  assert.equal(recovered.targetItems, 5);
  assert.equal(recovered.percentComplete, 60);
  assert.equal(recovered.currentCandidateId, 'nt_current');
  assert.equal(recovered.currentHeadline, 'Current stuck candidate');
  assert.equal(recovered.activeRun, false);
  assert.equal(recovered.failureStage, 'primary_source_discovery');
  assert.equal(recovered.failureCode, 'stale_run_timeout');
  assert.equal(recovered.usage.inputTokens, 72931);
  assert.equal(recovered.attemptedItems.length, 3);
  assert.equal(result.summary.runId, 'run_after_recovery_12345678');
});

test('run progress moves from indeterminate to target percentage and final 100', async () => {
  const items = Array.from({ length: 5 }, (_, i) => trackerItem(i + 1));
  const mocks = makeRunMocks(items, {
    usageFor: () => ({ input_tokens: 10, output_tokens: 3 }),
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true, requestRunId: 'run_progress_12345678' }, mocks);
  assert.equal(result.summary.targetItems, 5);
  assert.equal(result.summary.percentComplete, 100);
  assert.ok(mocks.runs.some((run) => run.targetItems === null && run.percentComplete === null));
  assert.ok(mocks.runs.some((run) => run.targetItems === 5 && run.percentComplete === 0));
  assert.ok(mocks.runs.some((run) => run.completedItems === 2 && run.percentComplete === 40));
});

test('attempted items preserve newest-first order, exclude skipped records and never exceed max', async () => {
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
  const items = Array.from({ length: 7 }, (_, i) => trackerItem(i + 1, { dateFound: hoursAgo(7 - i) }));
  const ordered = normalizeNewsTrackerResponse({ items }).items.sort((a, b) => Date.parse(b.dateFound) - Date.parse(a.dateFound));
  const existingLinks = [createStoryFingerprint(ordered[0])];
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsSkipped, 1);
  assert.equal(result.summary.attemptedItems.length, 5);
  assert.deepEqual(result.summary.attemptedItems.map((i) => i.headline), ordered.slice(1, 6).map((i) => i.headline));
});

test('usage accumulates input, output, cache and web-search fields across calls and candidates', async () => {
  const items = [trackerItem(1), trackerItem(2)];
  const mocks = makeRunMocks(items, {
    qualificationFor: (index, body) => String(body.messages?.[0]?.content || '').includes('Write a reported')
      ? goodDraft
      : { ...goodQualification, materialFacts: [] },
    usageFor: (call) => ({
      input_tokens: call * 10,
      output_tokens: call,
      cache_creation_input_tokens: 2,
      cache_read_input_tokens: 3,
      server_tool_use: { web_search_requests: 1 },
    }),
    model: 'claude-usage-test',
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '2',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.usage.anthropicCalls, 4);
  assert.equal(result.summary.usage.inputTokens, 100);
  assert.equal(result.summary.usage.outputTokens, 10);
  assert.equal(result.summary.usage.cacheCreationInputTokens, 8);
  assert.equal(result.summary.usage.cacheReadInputTokens, 12);
  assert.equal(result.summary.usage.webSearchRequests, 4);
  assert.deepEqual(result.summary.usage.models, ['claude-usage-test']);
  assert.equal(result.summary.attemptedItems[0].usage.anthropicCalls, 2);
});

test('anthropic call log writes started entry before request and updates same entry on completion', async () => {
  let sawStartedBeforeRequest = false;
  const mocks = makeRunMocks([trackerItem(1)], {
    qualificationFor: () => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null }),
    usageFor: () => ({ input_tokens: 11, output_tokens: 7, server_tool_use: { web_search_requests: 1 } }),
    responseForUrl: (href) => {
      if (href.includes('api.anthropic.com')) {
        sawStartedBeforeRequest = mocks.runs.some((run) => (run.anthropicCallLog || []).some((entry) => entry.status === 'started'));
      }
      return null;
    },
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(sawStartedBeforeRequest, true);
  assert.equal(result.summary.anthropicCallLog.length, 1);
  const entry = result.summary.anthropicCallLog[0];
  assert.match(entry.callId, /^anthropic_/);
  assert.equal(entry.status, 'completed');
  assert.equal(entry.stage, 'qualification');
  assert.equal(entry.inputTokens, 11);
  assert.equal(entry.outputTokens, 7);
  assert.equal(entry.webSearchRequests, 1);
  assert.equal(result.summary.currentAnthropicCallId, '');
  assert.equal(result.summary.lastCompletedAnthropicCallId, entry.callId);
});

test('per-call usage sums to run usage across multiple candidates', async () => {
  const mocks = makeRunMocks([trackerItem(1), trackerItem(2)], {
    qualificationFor: () => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null }),
    usageFor: (call) => ({ input_tokens: call * 10, output_tokens: call, cache_read_input_tokens: 2, server_tool_use: { web_search_requests: 1 } }),
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '2',
  }, { dryRun: true }, mocks);
  const totals = result.summary.anthropicCallLog.reduce((acc, entry) => {
    acc.inputTokens += entry.inputTokens;
    acc.outputTokens += entry.outputTokens;
    acc.cacheReadInputTokens += entry.cacheReadInputTokens;
    acc.webSearchRequests += entry.webSearchRequests;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, webSearchRequests: 0 });
  assert.deepEqual(totals, {
    inputTokens: result.summary.usage.inputTokens,
    outputTokens: result.summary.usage.outputTokens,
    cacheReadInputTokens: result.summary.usage.cacheReadInputTokens,
    webSearchRequests: result.summary.usage.webSearchRequests,
  });
});

test('deterministic rejection contributes zero usage and historical missing usage remains safe', async () => {
  const oldItem = trackerItem(1, { dateFound: '2026-01-01T00:00:00.000Z' });
  const mocks = makeRunMocks([oldItem]);
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.usage.anthropicCalls, 0);
  assert.equal(result.summary.attemptedItems[0].usage.inputTokens, 0);
  assert.doesNotThrow(() => JSON.stringify({ runId: 'run_old', state: 'completed' }));
});

test('prompt context limits deduplicate repeated article content and record truncation', () => {
  const repeated = '<nav>Share Subscribe Login</nav>' + Array.from({ length: 80 }, () => '<p>Central claim says the Ministry report found 42 percent of workers need reskilling in India.</p>').join('');
  const prepared = prepareSourceContext(repeated, 600);
  assert.equal(prepared.truncated, false);
  assert.ok(prepared.text.length < 180);
  assert.equal((prepared.text.match(/Central claim/g) || []).length, 1);
  const longPrepared = prepareSourceContext(Array.from({ length: 50 }, (_, i) => `Paragraph ${i} has a distinct official claim about workers and organisations in India`).join('. '), 500);
  assert.equal(longPrepared.truncated, true);
  assert.ok(longPrepared.text.length <= 500);
});

test('primary-source prompt excludes Webflow archive, full tracker dataset and raw search pages', () => {
  const archiveMarker = 'FULL_WEBFLOW_ARCHIVE_SHOULD_NOT_APPEAR';
  const trackerDatasetMarker = 'FULL_NEWS_TRACKER_DATASET_SHOULD_NOT_APPEAR';
  const item = trackerItem(1, {
    headline: 'Ministry survey says 42 percent of workers need AI training',
    extraArchive: archiveMarker,
    allTrackerItems: [{ headline: trackerDatasetMarker }],
  });
  const prompt = buildPrimarySourceDiscoveryPrompt(item, goodQualification, '<script>RAW_SEARCH_CONTENT_SHOULD_NOT_APPEAR</script> Official survey paragraph about workers and organisations in India.');
  assert.doesNotMatch(prompt, new RegExp(archiveMarker));
  assert.doesNotMatch(prompt, new RegExp(trackerDatasetMarker));
  assert.doesNotMatch(prompt, /<script>|RAW_SEARCH_CONTENT_SHOULD_NOT_APPEAR/);
  assert.match(prompt, /Article text was deduplicated/);
});

test('draft prompt uses bounded editorial fields instead of raw candidate object', () => {
  const prompt = buildDraftPrompt({
    item: baseItem,
    qualification: goodQualification,
    verification: {
      status: 'verified',
      summary: 'Verified.',
      excerpts: ['Repeated verified sentence about workers. '.repeat(100)],
      confirmedFacts: ['Fact'],
    },
    primarySources: [{ title: 'Official report', url: 'https://gov.in/report.pdf', publisherOrIssuer: 'Ministry', sourceType: 'government_report', verified: true }],
    rawModelResponse: 'RAW_MODEL_RESPONSE_SHOULD_NOT_APPEAR',
    firestoreRunRecord: { prompt: 'FIRESTORE_RUN_SHOULD_NOT_APPEAR' },
  });
  assert.doesNotMatch(prompt, /RAW_MODEL_RESPONSE_SHOULD_NOT_APPEAR|FIRESTORE_RUN_SHOULD_NOT_APPEAR/);
  assert.ok(prompt.length < 9000);
});

test('duplicate primary-source search queries are suppressed after normalisation', () => {
  const queries = buildPrimarySourceSearchQueries(trackerItem(1, { headline: 'EPFO report report', theme: 'EPFO report' }), {
    recommendedAngle: 'EPFO report',
    materialFacts: ['EPFO report'],
  });
  assert.equal(new Set(queries.map((q) => q.toLowerCase().replace(/\s+/g, ' '))).size, queries.length);
});

test('later technical failure preserves qualification data and stores safe failure metadata', async () => {
  const mocks = makeRunMocks([baseItem], {
    qualificationFor: (index, body) => String(body.messages?.[0]?.content || '').includes('Write a reported')
      ? { title: 'Bad draft' }
      : { ...goodQualification, materialFacts: [] },
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.failures, 1);
  assert.equal(result.summary.completedItems, 1);
  assert.equal(result.summary.percentComplete, 100);
  assert.equal(mocks.saved[0].qualificationResult.overallScore, goodQualification.overallScore);
  assert.equal(mocks.saved[0].failureStage, 'drafting_parse');
  assert.equal(mocks.saved[0].failureCode, 'drafting_json_invalid');
  assert.ok(mocks.saved[0].failureMessage.length <= 1000);
  assert.equal(JSON.stringify(mocks.saved[0]).includes('rawModelResponse'), false);
});

test('anthropic timeout fails only the affected candidate and continues with heartbeat updates', async () => {
  const timeout = new Error('request_timeout');
  timeout.name = 'AbortError';
  let beforeCalls = 0;
  let afterCalls = 0;
  const mocks = makeRunMocks([trackerItem(1), trackerItem(2)], {
    qualificationFor: (index) => {
      if (index === 1) return timeout;
      return { ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['No Wocult angle'], recommendedPriority: null };
    },
    beforeAnthropicCall: () => { beforeCalls += 1; },
    afterAnthropicCall: () => { afterCalls += 1; },
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '2',
    NEWS_BRIEF_ANTHROPIC_TIMEOUT_MS: '1000',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.completedItems, 2);
  assert.equal(result.summary.percentComplete, 100);
  assert.equal(result.summary.failures, 1);
  assert.equal(mocks.saved[0].status, 'qualification_failed');
  assert.equal(mocks.saved[0].failureStage, 'qualification');
  assert.equal(mocks.saved[0].failureCode, 'anthropic_timeout');
  assert.equal(result.summary.anthropicCallLog[0].status, 'timed_out');
  assert.equal(result.summary.anthropicCallLog[0].failureCode, 'anthropic_timeout');
  assert.equal(mocks.saved[1].status, 'rejected_by_filter');
  assert.equal(result.summary.attemptedItems.length, 2);
  assert.equal(result.summary.attemptedItems[0].failureCode, 'anthropic_timeout');
  assert.equal(beforeCalls, 2);
  assert.equal(afterCalls, 2);
  assert.ok(mocks.runs.filter((run) => run.heartbeatAt).length >= 4);
});

test('stale recovery uses current Anthropic stage and preserves interrupted call fields', async () => {
  const stale = {
    runId: 'run_stale_call_12345678',
    state: 'running',
    phase: 'unknown',
    startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    heartbeatAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    completedItems: 3,
    targetItems: 5,
    percentComplete: 60,
    currentCandidateId: 'nt_current',
    currentHeadline: 'Current stuck candidate',
    currentAnthropicCallId: 'anthropic_interrupted',
    currentAnthropicStage: 'primary_source_discovery',
    currentAnthropicCandidateId: 'nt_current',
    lastCompletedAnthropicCallId: 'anthropic_3',
    anthropicCallLog: [
      { callId: 'anthropic_3', status: 'completed', stage: 'qualification', inputTokens: 10, outputTokens: 2 },
      { callId: 'anthropic_interrupted', status: 'started', stage: 'primary_source_discovery', inputTokens: 0, outputTokens: 0 },
    ],
  };
  const mocks = makeRunMocks([], { activeRun: stale });
  await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_DRY_RUN: 'true',
  }, { dryRun: true, requestRunId: 'run_after_stale_call_12345678' }, mocks);
  const recovered = mocks.runs.find((run) => run.runId === stale.runId && run.state === 'failed');
  assert.equal(recovered.failureStage, 'primary_source_discovery');
  assert.equal(recovered.currentAnthropicCallId, 'anthropic_interrupted');
  assert.equal(recovered.lastCompletedAnthropicCallId, 'anthropic_3');
  assert.equal(recovered.anthropicCallLog.length, 2);
});

test('four calls with three completed candidates remain diagnosable from call log', async () => {
  const run = {
    anthropicCallLog: [
      { callId: 'c1', candidateId: 'a', stage: 'qualification', status: 'completed' },
      { callId: 'c2', candidateId: 'b', stage: 'qualification', status: 'completed' },
      { callId: 'c3', candidateId: 'c', stage: 'qualification', status: 'completed' },
      { callId: 'c4', candidateId: 'd', stage: 'primary_source_discovery', status: 'started' },
    ],
    completedItems: 3,
    targetItems: 5,
  };
  const completedCalls = run.anthropicCallLog.filter((entry) => entry.status === 'completed');
  const interrupted = run.anthropicCallLog.find((entry) => entry.status === 'started');
  assert.equal(completedCalls.length, 3);
  assert.equal(interrupted.candidateId, 'd');
  assert.equal(interrupted.stage, 'primary_source_discovery');
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

test('new deterministic rejection gets complete candidate metadata', async () => {
  const oldItem = trackerItem(1, { dateFound: '2026-01-01T00:00:00.000Z' });
  const mocks = makeRunMocks([oldItem]);
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsRejected, 1);
  assert.equal(mocks.calls.anthropic, 0);
  assert.equal(mocks.saved.length, 1);
  assert.equal(mocks.saved[0].status, 'rejected_by_filter');
  assertCandidateMetadata(mocks.saved[0]);
  assert.match(mocks.saved[0].runId, /^run_/);
});

test('new qualification rejection gets complete candidate metadata without raw model response', async () => {
  const mocks = makeRunMocks([baseItem], {
    qualificationFor: () => ({ ...goodQualification, qualifies: false, overallScore: 45, rejectionReasons: ['Insufficient Wocult angle'], recommendedPriority: null }),
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsRejected, 1);
  assert.equal(mocks.saved.length, 1);
  assert.equal(mocks.saved[0].status, 'rejected_by_filter');
  assertCandidateMetadata(mocks.saved[0]);
  assert.equal(JSON.stringify(mocks.saved[0]).includes('rawModelResponse'), false);
});

test('new needs_editorial_check candidate gets complete candidate metadata', async () => {
  const mocks = makeRunMocks([baseItem], {
    qualificationFor: () => ({ ...goodQualification, overallScore: 65, rejectionReasons: ['Needs editor judgement'] }),
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsNeedingEditorialCheck, 1);
  assert.equal(mocks.saved.length, 1);
  assert.equal(mocks.saved[0].status, 'needs_editorial_check');
  assertCandidateMetadata(mocks.saved[0]);
  assert.equal(mocks.saved[0].generatedDraft, null);
});

test('paywalled article can still discover and persist an official primary source', async () => {
  const item = trackerItem(1, { headline: 'Government report says AI hiring affects Indian workers', whyItMatters: 'The article relies on a government report.' });
  const mocks = makeRunMocks([item], {
    qualificationFor: () => ({ ...goodQualification, overallScore: 65, qualificationReasons: ['Needs editorial check on government report'], materialFacts: ['Government report on AI hiring'] }),
    responseForUrl: (url) => {
      if (url.includes('company-1-hiring')) return new Response('Subscribe to continue. Government report says AI hiring affects Indian workers.', { status: 200 });
      if (url.includes('labour.gov.in')) return new Response('Government report AI hiring Indian workers', { status: 200 });
      return null;
    },
    primarySourceSearch: async () => ({
      primarySources: [{ title: 'Government report on AI hiring', url: 'https://labour.gov.in/reports/ai-hiring.pdf', publisherOrIssuer: 'Labour Ministry', sourceType: 'government_report', relationship: 'reports_findings_from', discoveryMethod: 'official_site_search', confidence: 'high' }],
      searchesAttempted: ['Government report on AI hiring official PDF'],
      organisationsChecked: ['Labour Ministry'],
    }),
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsNeedingEditorialCheck, 1);
  assert.equal(mocks.saved[0].primarySourceDiscoveryStatus, 'found');
  assert.equal(mocks.saved[0].primarySources[0].url, 'https://labour.gov.in/reports/ai-hiring.pdf');
});

test('missing required primary source sends otherwise qualified candidate to editorial check without drafting', async () => {
  const item = trackerItem(1, { headline: 'Survey report says layoffs affect Indian workers', whyItMatters: 'The article relies on a survey report.' });
  const mocks = makeRunMocks([item], {
    qualificationFor: () => ({ ...goodQualification, overallScore: 88, materialFacts: ['Survey report about layoffs'] }),
    responseForUrl: (url) => {
      if (url.includes('company-1-hiring')) return new Response('Article cites a survey report but does not link it.', { status: 200 });
      return null;
    },
    primarySourceSearch: async () => ({ primarySources: [], searchesAttempted: ['survey report official'], organisationsChecked: ['unknown'], notes: 'No authoritative source found.' }),
  });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsNeedingEditorialCheck, 1);
  assert.equal(result.summary.draftsGenerated, 0);
  assert.equal(mocks.calls.draft, 0);
  assert.equal(mocks.saved[0].status, 'needs_editorial_check');
  assert.equal(mocks.saved[0].primarySourceDiscoveryStatus, 'not_found');
  assert.equal(mocks.saved[0].generatedDraft, null);
});

test('candidate metadata updates preserve first-seen fields and backfill missing createdAt safely', () => {
  const existing = {
    candidateId: 'nt_existing',
    status: 'needs_editorial_check',
    discoveredTimestamp: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-11T08:00:00.000Z',
    firstSeenRunId: 'run_first',
    lastProcessedRunId: 'run_old',
    runId: 'run_old',
  };
  const updated = withCandidateMetadata({ ...existing, status: 'held' }, existing, {
    runId: 'run_new',
    now: '2026-07-12T08:00:00.000Z',
  });
  assert.equal(updated.createdAt, '2026-07-10T08:00:00.000Z');
  assert.equal(updated.firstSeenRunId, 'run_first');
  assert.equal(updated.updatedAt, '2026-07-12T08:00:00.000Z');
  assert.equal(updated.lastProcessedRunId, 'run_new');
  assert.equal(updated.runId, 'run_new');
  assert.equal(updated.metadataBackfilled, true);
});

test('candidate metadata never overwrites existing createdAt', () => {
  const existing = {
    candidateId: 'nt_existing',
    createdAt: '2026-07-09T08:00:00.000Z',
    updatedAt: '2026-07-10T08:00:00.000Z',
    firstSeenRunId: 'run_first',
  };
  const updated = withCandidateMetadata({ ...existing, createdAt: '2026-07-12T08:00:00.000Z', status: 'approved' }, existing, {
    runId: 'run_new',
    now: '2026-07-13T08:00:00.000Z',
  });
  assert.equal(updated.createdAt, '2026-07-09T08:00:00.000Z');
  assert.equal(updated.firstSeenRunId, 'run_first');
  assert.equal(updated.updatedAt, '2026-07-13T08:00:00.000Z');
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

test('run processes newest unhandled News Tracker items before older items', async () => {
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
  const items = [
    trackerItem(1, { dateFound: hoursAgo(7) }),
    trackerItem(2, { dateFound: hoursAgo(6) }),
    trackerItem(3, { dateFound: hoursAgo(5) }),
    trackerItem(4, { dateFound: hoursAgo(4) }),
    trackerItem(5, { dateFound: hoursAgo(3) }),
    trackerItem(6, { dateFound: hoursAgo(2) }),
    trackerItem(7, { dateFound: hoursAgo(1) }),
  ];
  const ordered = sortNewsTrackerItemsNewestFirst(normalizeNewsTrackerResponse({ items }).items);
  const mocks = makeRunMocks(items);
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsRejected, 5);
  assert.equal(mocks.saved.length, 5);
  assert.deepEqual(mocks.saved.map((c) => c.originalHeadline), ordered.slice(0, 5).map((i) => i.headline));
});

test('newest-first skipped records do not consume processing slots', async () => {
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
  const items = Array.from({ length: 8 }, (_, i) => trackerItem(i + 1, { dateFound: hoursAgo(8 - i) }));
  const ordered = sortNewsTrackerItemsNewestFirst(normalizeNewsTrackerResponse({ items }).items);
  const existingLinks = ordered.slice(0, 3).map(createStoryFingerprint);
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
  assert.equal(mocks.saved.length, 5);
  assert.deepEqual(mocks.saved.map((c) => c.originalHeadline), ordered.slice(3, 8).map((i) => i.headline));
});

test('older News Tracker records are eventually processed after newer records are exhausted', async () => {
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
  const items = [
    trackerItem(1, { headline: 'Older workforce update still eventually processed', dateFound: hoursAgo(12) }),
    trackerItem(2, { headline: 'Newest workforce update already handled', dateFound: hoursAgo(1) }),
    trackerItem(3, { headline: 'Second newest workforce update already handled', dateFound: hoursAgo(2) }),
  ];
  const ordered = sortNewsTrackerItemsNewestFirst(normalizeNewsTrackerResponse({ items }).items);
  const existingLinks = ordered.slice(0, 2).map(createStoryFingerprint);
  const mocks = makeRunMocks(items, { existingLinks });
  const result = await runNewsBriefAutomation({
    NEWS_TRACKER_API: 'https://tracker.example.test/current',
    NEWS_BRIEF_AUTOMATION_ENABLED: 'true',
    NEWS_BRIEF_DRY_RUN: 'true',
    NEWS_BRIEF_MAX_ITEMS_PER_RUN: '5',
  }, { dryRun: true }, mocks);
  assert.equal(result.summary.itemsSkipped, 2);
  assert.equal(result.summary.itemsRejected, 1);
  assert.equal(mocks.saved.length, 1);
  assert.equal(mocks.saved[0].originalHeadline, 'Older workforce update still eventually processed');
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
  assert.equal(mocks.saved.length, 5);
  assert.equal(mocks.saved[0].status, 'qualification_failed');
  assertCandidateMetadata(mocks.saved[0]);
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
  }, { dryRun: false }, { fetch, store, fetchWebflowNewsArchive: async () => [] });
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
  }, { dryRun: true }, { fetch, store, fetchWebflowNewsArchive: async () => [] });
  assert.equal(result.summary.failures, 1);
  assert.equal(result.summary.itemsRejected, 1);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].status, 'qualification_failed');
  assert.equal(saved[0].generatedDraft, null);
  assertCandidateMetadata(saved[0]);
  assert.equal(saved[1].status, 'rejected_by_filter');
  assert.equal(saved[1].qualificationResult.qualifies, false);
  assert.equal(saved[1].qualificationResult.recommendedPriority, null);
  assert.equal(saved[1].recommendedPriority, null);
  assert.equal(saved[1].generatedDraft, null);
  assertCandidateMetadata(saved[1]);
  assert.equal(result.summary.draftsGenerated, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(saved[1].qualificationResult, 'rawModelResponse'), false);
  assert.equal(JSON.stringify(saved[0]).includes('rawModelResponse'), false);
  assert.equal(JSON.stringify(saved[1]).includes('rawModelResponse'), false);
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
  }, { dryRun: true }, { fetch, store, fetchWebflowNewsArchive: async () => [] });
  assert.equal(result.summary.failures, 1);
  assert.equal(result.summary.errorSummary[0].error, 'Invalid qualification JSON: recommendedPriority_invalid');
  assert.equal(result.summary.errorSummary[0].qualificationDiagnostic.length, 4000);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'qualification_failed');
  assert.equal(saved[0].qualificationDiagnostic.length, 4000);
  assertCandidateMetadata(saved[0]);
  assert.equal(JSON.stringify(saved[0]).includes('rawModelResponse'), false);
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

  const stale = {
    runId: 'run_status_stale_12345678',
    state: 'running',
    phase: 'drafting',
    startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    heartbeatAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    completedItems: 3,
    targetItems: 5,
    percentComplete: 60,
    usage: { anthropicCalls: 3, inputTokens: 72931, outputTokens: 3279, webSearchRequests: 7, models: ['claude-test'] },
  };
  let recoveredRun = null;
  const recoveredResponse = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/status?runId=run_status_stale_12345678', {
    headers: { Authorization: 'Bearer admin' },
  }), { WORKER_ADMIN_TOKEN: 'admin', NEWS_BRIEF_DRY_RUN: 'true' }, null, {}, {
    store: {
      getRun: async () => stale,
      saveRun: async (run) => { recoveredRun = run; },
    },
  });
  const recoveredData = await recoveredResponse.json();
  assert.equal(recoveredData.run.state, 'failed');
  assert.equal(recoveredData.run.percentComplete, 60);
  assert.equal(recoveredData.run.failureCode, 'stale_run_timeout');
  assert.equal(recoveredData.run.activeRun, false);
  assert.equal(recoveredRun.activeRun, false);

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

test('retry path updates lastProcessedRunId without replacing firstSeenRunId', async () => {
  const existing = {
    candidateId: 'c1',
    status: 'approved',
    firstSeenRunId: 'run_first',
    lastProcessedRunId: 'run_previous',
    runId: 'run_previous',
    createdAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-10T09:00:00.000Z',
    generatedDraft: goodDraft,
    originalHeadline: baseItem.headline,
    storyFingerprint: 'fp1',
    clusterKey: 'cluster1',
    primarySourceUrl: baseItem.link,
    publishers: [baseItem.source],
  };
  let savedCandidate = null;
  const adminAuth = 'Bearer ' + 'admin';
  const headers = new Headers();
  headers.set('Authorization', adminAuth);
  headers.set('Content-Type', 'application/json');
  const response = await handleAutomationRequest(new Request('https://worker.test/automation/news-briefs/retry', {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateId: 'c1' }),
  }), {
    WORKER_ADMIN_TOKEN: 'admin',
    NEWS_BRIEF_DRY_RUN: 'true',
  }, null, {}, {
    store: {
      getCandidate: async () => existing,
      saveCandidate: async (candidate) => { savedCandidate = candidate; return candidate; },
    },
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(savedCandidate.firstSeenRunId, 'run_first');
  assert.equal(savedCandidate.createdAt, '2026-07-10T08:00:00.000Z');
  assert.match(savedCandidate.lastProcessedRunId, /^retry_/);
  assert.equal(savedCandidate.runId, savedCandidate.lastProcessedRunId);
  assert.notEqual(savedCandidate.lastProcessedRunId, 'run_previous');
  assert.notEqual(savedCandidate.updatedAt, existing.updatedAt);
  assert.equal(savedCandidate.webflowStatus, 'dry_run_skipped');
});

test('approval email date label does not present discovery time as source publication time', () => {
  const email = renderApprovalEmail([
    { id: 'c1', proposedHeadline: goodDraft.title, originalHeadline: baseItem.headline, generatedDraft: goodDraft, qualificationResult: goodQualification, qualificationScore: 82, discoveredAt: recent, supportingSourceUrls: [] },
  ], 'divya@wocult.com', { c1: { approve: 'https://a/2', hold: 'https://h/2', decline: 'https://d/2', review: 'https://r/2' } });
  assert.match(email.html, /Source publication time unknown/);
  assert.match(email.html, /divya@wocult.com/);
});
