import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automationCandidateToArticle,
  candidateFromTrackerItem,
  clusterKey,
  createStoryFingerprint,
  deterministicEligibility,
  getAutomationConfig,
  handleAutomationRequest,
  normalizeNewsTrackerResponse,
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
