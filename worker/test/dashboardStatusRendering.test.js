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

function loadDashboardHarness() {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('var automatedNewsBriefFilter');
  const end = html.indexOf('function loadAutomatedNewsBriefActivity', start);
  assert.ok(start > 0 && end > start, 'Automated News Brief rendering block must be present');
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { id, innerHTML: '' });
      return elements.get(id);
    },
  };
  const context = {
    document,
    window: {
      console: { debug() {} },
      location: { search: '' },
      localStorage: { getItem() { return ''; } },
    },
    console: { debug() {}, warn() {} },
    escapeHtml,
    escapeAttr: escapeHtml,
    loadAutomatedNewsBriefActivity() {},
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return { ctx: context, elements };
}

function candidate(id, status, overrides = {}) {
  return {
    id,
    status,
    originalHeadline: `Candidate ${id}`,
    publishers: ['Source A'],
    primarySourceUrl: `https://example.test/${id}`,
    clusterKey: 'same-cluster',
    rejectionReasons: status === 'rejected_by_filter' ? [`Rejected ${id}`] : [],
    qualificationResult: {
      qualifies: status !== 'rejected_by_filter',
      qualificationReasons: ['Relevant to working professionals'],
      rejectionReasons: status === 'rejected_by_filter' ? [`Model rejected ${id}`] : [],
      missingInformation: ['Needs editor check'],
      factualRisk: 'medium',
      legalRisk: 'low',
      materialFacts: ['Material fact'],
    },
    recommendedAngle: 'Editorial angle',
    ...overrides,
  };
}

function setItems(ctx, items) {
  ctx.automatedNewsBriefItems = items.map((item) => ({
    ...item,
    normalizedStatus: ctx.automatedNewsBriefStatus(item),
  }));
}

function cardCount(html) {
  return (html.match(/data-candidate-id=/g) || []).length;
}

test('dashboard renders nine rejected candidates as nine distinct cards', () => {
  const { ctx, elements } = loadDashboardHarness();
  setItems(ctx, Array.from({ length: 9 }, (_, index) => candidate(`rej${index + 1}`, 'rejected_by_filter', {
    source: 'same source',
    clusterKey: 'duplicate-cluster',
  })));
  ctx.automatedNewsBriefFilter = 'rejected_by_filter';
  ctx.renderAutomatedNewsBriefList();
  const listHtml = elements.get('automated-news-brief-list').innerHTML;
  assert.equal(cardCount(listHtml), 9);
  assert.match(listHtml, /data-candidate-id="rej1"/);
  assert.match(listHtml, /data-candidate-id="rej9"/);
  assert.equal(ctx.automatedNewsBriefSelectedId, 'rej1');
  const detailHtml = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(detailHtml, /Rejection reasons/);
  assert.match(detailHtml, /Rejected items are read-only/);
  assert.doesNotMatch(detailHtml, />Approve</);
  assert.doesNotMatch(detailHtml, /Retry Webflow submission/);
});

test('dashboard renders one needs_editorial_check candidate and populates details', () => {
  const { ctx, elements } = loadDashboardHarness();
  setItems(ctx, [candidate('editorial1', 'needs_editorial_check')]);
  ctx.automatedNewsBriefFilter = 'needs_editorial_check';
  ctx.renderAutomatedNewsBriefList();
  assert.equal(cardCount(elements.get('automated-news-brief-list').innerHTML), 1);
  assert.equal(ctx.automatedNewsBriefSelectedId, 'editorial1');
  const detailHtml = elements.get('automated-news-brief-detail').innerHTML;
  assert.match(detailHtml, /Qualification reasons/);
  assert.match(detailHtml, /Cautions/);
  assert.match(detailHtml, /Recommended angle/);
  assert.match(detailHtml, /Editorial-check items are read-only/);
  assert.doesNotMatch(detailHtml, />Approve</);
});

test('dashboard switches tabs and clears detail panel for empty tabs', () => {
  const { ctx, elements } = loadDashboardHarness();
  setItems(ctx, [candidate('editorial1', 'needs_editorial_check')]);
  ctx.setAutomatedNewsBriefFilter('needs_editorial_check');
  assert.equal(ctx.automatedNewsBriefSelectedId, 'editorial1');
  assert.match(elements.get('automated-news-brief-detail').innerHTML, /Candidate editorial1/);
  ctx.setAutomatedNewsBriefFilter('rejected_by_filter');
  assert.equal(ctx.automatedNewsBriefSelectedId, '');
  assert.equal(cardCount(elements.get('automated-news-brief-list').innerHTML), 0);
  assert.match(elements.get('automated-news-brief-detail').innerHTML, /No candidates in this view/);
});

test('dashboard keeps duplicate cluster and source records distinct by Firestore id', () => {
  const { ctx, elements } = loadDashboardHarness();
  setItems(ctx, [
    candidate('docA', 'rejected_by_filter', { originalHeadline: 'Same headline', source: 'Same source' }),
    candidate('docB', 'rejected_by_filter', { originalHeadline: 'Same headline', source: 'Same source' }),
  ]);
  ctx.automatedNewsBriefFilter = 'rejected_by_filter';
  ctx.renderAutomatedNewsBriefList();
  const listHtml = elements.get('automated-news-brief-list').innerHTML;
  assert.equal(cardCount(listHtml), 2);
  assert.match(listHtml, /data-candidate-id="docA"/);
  assert.match(listHtml, /data-candidate-id="docB"/);
});

test('dashboard handles missing optional fields and unknown statuses without emptying all lists', () => {
  const { ctx, elements } = loadDashboardHarness();
  setItems(ctx, [
    { id: 'malformed', status: 'unexpected_status' },
    candidate('rejected', 'rejected_by_filter'),
  ]);
  ctx.setAutomatedNewsBriefFilter('other');
  assert.equal(cardCount(elements.get('automated-news-brief-list').innerHTML), 1);
  assert.equal(ctx.automatedNewsBriefSelectedId, 'malformed');
  ctx.setAutomatedNewsBriefFilter('rejected_by_filter');
  assert.equal(cardCount(elements.get('automated-news-brief-list').innerHTML), 1);
  assert.equal(ctx.automatedNewsBriefSelectedId, 'rejected');
});

test('dashboard tab counts equal rendered-card totals for ten loaded candidates', () => {
  const { ctx, elements } = loadDashboardHarness();
  const items = Array.from({ length: 9 }, (_, index) => candidate(`rej${index + 1}`, 'rejected_by_filter'))
    .concat(candidate('editorial1', 'needs_editorial_check'));
  setItems(ctx, items);
  const counts = Object.fromEntries(ctx.AUTOMATED_NEWS_BRIEF_TABS.map(([status]) => [
    status,
    ctx.automatedNewsBriefRowsForFilter(status).length,
  ]));
  assert.equal(counts.rejected_by_filter, 9);
  assert.equal(counts.needs_editorial_check, 1);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 10);
  ctx.setAutomatedNewsBriefFilter('rejected_by_filter');
  assert.equal(cardCount(elements.get('automated-news-brief-list').innerHTML), 9);
  ctx.setAutomatedNewsBriefFilter('needs_editorial_check');
  assert.equal(cardCount(elements.get('automated-news-brief-list').innerHTML), 1);
});
