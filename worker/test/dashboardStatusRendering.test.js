import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadDashboardStatusHelpers() {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('var automatedNewsBriefFilter');
  const end = html.indexOf('function renderAutomatedNewsBriefList', start);
  assert.ok(start > 0 && end > start, 'Automated News Brief helper block must be present');
  const context = { window: { console: { debug() {} } }, console: { debug() {} } };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end), context);
  return context;
}

function tabCounts(ctx, items) {
  return Object.fromEntries(ctx.AUTOMATED_NEWS_BRIEF_TABS.map(([status]) => [
    status,
    items.filter((item) => ctx.automatedNewsBriefMatchesFilter({
      ...item,
      normalizedStatus: ctx.automatedNewsBriefStatus(item),
    }, status)).length,
  ]));
}

test('dashboard status helpers count and render rejected_by_filter candidates', () => {
  const ctx = loadDashboardStatusHelpers();
  const items = [{ id: 'c1', status: 'rejected_by_filter' }];
  const counts = tabCounts(ctx, items);
  assert.equal(ctx.automatedNewsBriefStatus(items[0]), 'rejected_by_filter');
  assert.equal(counts.rejected_by_filter, 1);
});

test('dashboard status helpers count and render needs_editorial_check candidates', () => {
  const ctx = loadDashboardStatusHelpers();
  const items = [{ id: 'c1', status: 'needs_editorial_check' }];
  const counts = tabCounts(ctx, items);
  assert.equal(ctx.automatedNewsBriefStatus(items[0]), 'needs_editorial_check');
  assert.equal(counts.needs_editorial_check, 1);
});

test('dashboard status helpers place unknown statuses in other bucket', () => {
  const ctx = loadDashboardStatusHelpers();
  const items = [{ id: 'c1', status: 'unexpected_status' }];
  const counts = tabCounts(ctx, items);
  assert.equal(ctx.automatedNewsBriefStatus(items[0]), 'other');
  assert.equal(counts.other, 1);
});

test('dashboard status helpers do not produce zero counts for ten loaded candidates', () => {
  const ctx = loadDashboardStatusHelpers();
  const statuses = [
    'rejected_by_filter',
    'needs_editorial_check',
    'verifying',
    'verification_failed',
    'drafting',
    'drafting_failed',
    'awaiting_approval',
    'held',
    'webflow_draft_created',
    'unexpected_status',
  ];
  const counts = tabCounts(ctx, statuses.map((status, index) => ({ id: `c${index}`, status })));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  assert.equal(total, 10);
  assert.notDeepEqual(Object.values(counts), Object.values(counts).map(() => 0));
});
