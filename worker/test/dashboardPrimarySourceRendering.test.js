import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadDashboardHarness() {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function automatedNewsBriefPrimarySourceBadge');
  const end = html.indexOf('function resendAutomatedNewsBriefEmail');
  assert.ok(start > 0 && end > start, 'dashboard primary-source functions must be present');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, innerHTML: '', textContent: '', value: '', style: {} });
    return elements.get(id);
  }
  const writes = [];
  const activities = [];
  const context = {
    automatedNewsBriefItems: [],
    currentUser: { email: 'staff@example.com', getIdToken: async () => 'token' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } },
    document: { getElementById: element },
    alert: (message) => { context.lastAlert = message; },
    confirm: () => true,
    prompt: () => 'editorial note',
    loadAutomatedNewsBriefs: async () => [],
    loadAutomatedNewsBriefActivity: () => {},
    workerFetch: async (path, options) => {
      context.lastWorkerRequest = { path, options: JSON.parse(options.body || '{}') };
      return { ok: true, json: async () => ({ ok: true }) };
    },
    db: {
      collection: () => ({
        doc: () => ({
          set: async (patch) => { writes.push(patch); },
          collection: () => ({ add: async (activity) => { activities.push(activity); } }),
        }),
      }),
    },
    escapeHtml: (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    escapeAttr(value) { return context.escapeHtml(value).replace(/`/g, '&#96;'); },
    writes,
    activities,
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  context.loadAutomatedNewsBriefActivity = () => {};
  return { context, element, writes, activities };
}

function sampleCandidate(overrides = {}) {
  return {
    id: 'candidate_1',
    status: 'needs_editorial_check',
    originalHeadline: 'Government report says AI hiring affects Indian workers',
    articleSourceName: 'Economic Times',
    articleSourceUrl: 'https://economictimes.indiatimes.com/jobs/story',
    articleSourcePublishedTimestamp: '2026-07-15T10:00:00.000Z',
    qualificationScore: 66,
    recommendedPriority: 'P2',
    primarySourceDiscoveryStatus: 'found',
    primarySources: [{
      title: 'Government report on AI hiring',
      url: 'https://labour.gov.in/reports/ai-hiring.pdf',
      publisherOrIssuer: 'Labour Ministry',
      sourceType: 'government_report',
      publicationDate: '2026-07-14',
      relationship: 'reports_findings_from',
      confidence: 'high',
      verified: false,
      verificationNote: 'Official PDF found; staff confirmation required.',
    }],
    ...overrides,
  };
}

test('dashboard renders article source and primary source separately with clickable official link', () => {
  const { context, element } = loadDashboardHarness();
  context.renderAutomatedNewsBriefDetail(sampleCandidate());
  const html = element('automated-news-brief-detail').innerHTML;
  assert.match(html, /Article source/);
  assert.match(html, /Economic Times/);
  assert.match(html, /Original \/ primary source/);
  assert.match(html, /Government report on AI hiring/);
  assert.match(html, /https:\/\/labour\.gov\.in\/reports\/ai-hiring\.pdf/);
  assert.match(html, /unverified/);
});

test('dashboard renders multiple primary sources and clear missing or ambiguous states', () => {
  const { context } = loadDashboardHarness();
  const multiple = context.automatedNewsBriefPrimarySourcesHtml(sampleCandidate({
    primarySourceDiscoveryStatus: 'multiple_found',
    primarySources: [
      { title: 'Government notification', url: 'https://labour.gov.in/n.pdf', sourceType: 'government_notification', confidence: 'high' },
      { title: 'Court order', url: 'https://sci.gov.in/order.pdf', sourceType: 'court_order', confidence: 'medium' },
    ],
  }));
  assert.match(multiple, /1\. Government notification/);
  assert.match(multiple, /2\. Court order/);
  const notFound = context.automatedNewsBriefPrimarySourcesHtml(sampleCandidate({ primarySourceDiscoveryStatus: 'not_found', primarySources: [], primarySourceDiscoveryNotes: 'Searched ministry and regulator sites.' }));
  assert.match(notFound, /Primary source not found/);
  assert.match(notFound, /Staff should investigate manually/);
  const ambiguous = context.automatedNewsBriefPrimarySourcesHtml(sampleCandidate({ primarySourceDiscoveryStatus: 'ambiguous', primarySources: [] }));
  assert.match(ambiguous, /Multiple possible primary sources found/);
});

test('dashboard staff controls confirm, reject and add manual primary sources', async () => {
  const { context, element, writes } = loadDashboardHarness();
  context.automatedNewsBriefItems = [sampleCandidate()];
  await context.confirmAutomatedNewsBriefPrimarySource('candidate_1', 0);
  assert.equal(writes.at(-1).primarySources[0].confirmedByStaff, true);
  await context.rejectAutomatedNewsBriefPrimarySource('candidate_1', 0);
  assert.equal(writes.at(-1).primarySources[0].rejectedByStaff, true);
  element('automated-news-brief-manual-primary-url').value = 'https://labour.gov.in/manual.pdf';
  element('automated-news-brief-manual-primary-title').value = 'Manual ministry report';
  await context.addAutomatedNewsBriefManualPrimarySource('candidate_1');
  assert.equal(writes.at(-1).primarySources.at(-1).discoveryMethod, 'manual_staff_entry');
  assert.equal(writes.at(-1).primarySources.at(-1).verified, true);
});

test('dashboard approval without primary source requires an editorial note', async () => {
  const { context } = loadDashboardHarness();
  context.automatedNewsBriefItems = [sampleCandidate({ primarySourceDiscoveryStatus: 'not_found', primarySources: [] })];
  context.prompt = () => '';
  await context.dashboardAutomatedNewsBriefAction('candidate_1', 'approve');
  assert.equal(context.lastWorkerRequest, undefined);
  context.prompt = () => 'Approved with secondary article because official source is unavailable.';
  await context.dashboardAutomatedNewsBriefAction('candidate_1', 'approve');
  assert.equal(context.lastWorkerRequest.options.note, 'Approved with secondary article because official source is unavailable.');
});

test('dashboard source rendering tolerates missing optional fields and omits raw diagnostics', () => {
  const { context } = loadDashboardHarness();
  const html = context.automatedNewsBriefPrimarySourcesHtml(sampleCandidate({
    primarySources: [{ url: 'https://labour.gov.in/source.pdf' }],
    rawModelResponse: 'secret raw response',
    rawSearchOutput: 'full search page',
  }));
  assert.match(html, /https:\/\/labour\.gov\.in\/source\.pdf/);
  assert.doesNotMatch(html, /secret raw response|full search page/);
});
