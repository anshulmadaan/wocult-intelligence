import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  classifyItems,
  chunkRows,
  exampleBatchBodies,
  fetchAllItems,
  parseArgs,
  parseDevVars,
  printDryRun,
  publishedIsoFromPublishedDate,
  reportPaths,
  runBackfill,
  writeReports,
} from '../../scripts/backfill-news-published-iso.mjs';

function item(overrides = {}) {
  return {
    id: 'item-1',
    isDraft: false,
    isArchived: false,
    lastPublished: '2026-07-08T00:00:00.000Z',
    createdOn: '2026-07-07T21:14:58.123Z',
    cmsLocaleId: 'locale-1',
    fieldData: {
      name: 'News item',
      slug: 'news-item',
      'published-date': '2026-07-07T21:14:58.123Z',
      'published-iso': '',
    },
    ...overrides,
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

test('classifies eligible and skipped Webflow News items', () => {
  const existingIso = item({ id: 'existing', fieldData: { name: 'Existing', slug: 'existing', 'published-date': '2026-01-01T00:00:00.000Z', 'published-iso': '2026-01-01T00:00:00.000Z' } });
  const draft = item({ id: 'draft', isDraft: true });
  const archived = item({ id: 'archived', isArchived: true });
  const neverPublished = item({ id: 'never', lastPublished: '' });
  const invalidPublishedDate = item({ id: 'invalid', fieldData: { name: 'Invalid', slug: 'invalid', 'published-date': 'not-a-date', 'published-iso': '' } });
  const missingPublishedDate = item({ id: 'missing-date', fieldData: { name: 'Missing date', slug: 'missing-date', 'published-iso': '' } });
  const missing = item({ id: 'missing', createdOn: '2026-08-01T00:00:00.000Z', fieldData: { name: 'Missing', slug: 'missing', 'published-date': '2026-07-07T21:14:58.123Z', 'published-iso': '   ' } });

  const { summary, rows } = classifyItems([existingIso, draft, archived, neverPublished, invalidPublishedDate, missingPublishedDate, missing]);
  assert.equal(summary.totalFetched, 7);
  assert.equal(summary.publishedNonArchived, 4);
  assert.equal(summary.draftSkipped, 1);
  assert.equal(summary.archivedSkipped, 1);
  assert.equal(summary.neverPublishedSkipped, 1);
  assert.equal(summary.alreadyPopulated, 1);
  assert.equal(summary.matchingPublishedIso, 1);
  assert.equal(summary.mismatchedPublishedIso, 0);
  assert.equal(summary.invalidExistingPublishedIso, 0);
  assert.equal(summary.missingPublishedIso, 1);
  assert.equal(summary.missingPublishedDate, 1);
  assert.equal(summary.invalidPublishedDate, 1);
  assert.equal(summary.readyToUpdate, 1);
  assert.equal(rows.find((row) => row.itemId === 'existing').reason, 'matching-published-iso');
  assert.equal(rows.find((row) => row.itemId === 'draft').reason, 'draft');
  assert.equal(rows.find((row) => row.itemId === 'archived').reason, 'archived');
  assert.equal(rows.find((row) => row.itemId === 'never').reason, 'never-published');
  assert.equal(rows.find((row) => row.itemId === 'invalid').reason, 'invalid-published-date');
  assert.equal(rows.find((row) => row.itemId === 'missing-date').reason, 'missing-published-date');
  assert.equal(rows.find((row) => row.itemId === 'missing').proposedPublishedIso, '2026-07-07T21:14:58.123Z');
});

test('mismatched and invalid existing published-iso values are repaired', () => {
  const empty = item({ id: 'empty', fieldData: { name: 'Empty', slug: 'empty', 'published-date': '2026-07-07T21:14:58.123Z', 'published-iso': '' } });
  const matching = item({ id: 'matching', fieldData: { name: 'Matching', slug: 'matching', 'published-date': '2026-07-07T21:14:58.123Z', 'published-iso': '2026-07-07T21:14:58.123Z' } });
  const equivalent = item({ id: 'equivalent', fieldData: { name: 'Equivalent', slug: 'equivalent', 'published-date': '2026-07-07T15:44:58.000Z', 'published-iso': '2026-07-07T21:14:58+05:30' } });
  const mismatched = item({ id: 'mismatched', fieldData: { name: 'Mismatch', slug: 'mismatched', 'published-date': '2026-07-06T20:30:00.000Z', 'published-iso': '2026-07-07T21:14:58.495Z' } });
  const invalidExisting = item({ id: 'invalid-existing', fieldData: { name: 'Invalid existing', slug: 'invalid-existing', 'published-date': '2026-07-27T20:46:38.213Z', 'published-iso': 'not-a-date' } });

  const { summary, rows } = classifyItems([empty, matching, equivalent, mismatched, invalidExisting]);
  assert.equal(summary.missingPublishedIso, 1);
  assert.equal(summary.matchingPublishedIso, 2);
  assert.equal(summary.mismatchedPublishedIso, 2);
  assert.equal(summary.invalidExistingPublishedIso, 1);
  assert.equal(summary.readyToUpdate, 3);
  assert.equal(rows.find((row) => row.itemId === 'empty').reason, 'missing-published-iso');
  assert.equal(rows.find((row) => row.itemId === 'matching').reason, 'matching-published-iso');
  assert.equal(rows.find((row) => row.itemId === 'equivalent').reason, 'matching-published-iso');
  assert.equal(rows.find((row) => row.itemId === 'mismatched').reason, 'mismatched-published-iso');
  assert.equal(rows.find((row) => row.itemId === 'mismatched').proposedPublishedIso, '2026-07-06T20:30:00.000Z');
  assert.equal(rows.find((row) => row.itemId === 'invalid-existing').reason, 'invalid-existing-published-iso');
  assert.equal(rows.find((row) => row.itemId === 'invalid-existing').proposedPublishedIso, '2026-07-27T20:46:38.213Z');
});

test('published-date converts to full ISO and invalid values are rejected', () => {
  assert.equal(publishedIsoFromPublishedDate('2026-07-07T21:14:58.123Z'), '2026-07-07T21:14:58.123Z');
  assert.equal(publishedIsoFromPublishedDate('2026-07-07T21:14:58+05:30'), '2026-07-07T15:44:58.000Z');
  assert.equal(publishedIsoFromPublishedDate('invalid'), '');
  assert.equal(publishedIsoFromPublishedDate('   '), '');
});

test('createdOn is ignored when published-date differs before or after it', () => {
  const earlier = item({ id: 'earlier', createdOn: '2026-07-10T00:00:00.000Z', fieldData: { name: 'Earlier', slug: 'earlier', 'published-date': '2026-07-01T12:00:00.000Z', 'published-iso': '' } });
  const later = item({ id: 'later', createdOn: '2026-07-01T00:00:00.000Z', fieldData: { name: 'Later', slug: 'later', 'published-date': '2026-07-10T12:00:00.000Z', 'published-iso': '' } });
  const { rows } = classifyItems([earlier, later]);
  assert.equal(rows.find((row) => row.itemId === 'earlier').proposedPublishedIso, '2026-07-01T12:00:00.000Z');
  assert.equal(rows.find((row) => row.itemId === 'later').proposedPublishedIso, '2026-07-10T12:00:00.000Z');
});

test('pagination is handled when fetching collection items', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('offset=0')) {
      return jsonResponse({ items: [item({ id: 'a' })], pagination: { total: 2 } });
    }
    return jsonResponse({ items: [item({ id: 'b' })], pagination: { total: 2 } });
  };
  const items = await fetchAllItems({ token: 'secret-token', fetchImpl });
  assert.deepEqual(items.map((entry) => entry.id), ['a', 'b']);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /limit=100&offset=0/);
  assert.match(calls[1], /limit=100&offset=100/);
});

test('dry run performs no writes and API token is never logged', async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ items: [item()], pagination: { total: 1 } });
  };
  const report = await runBackfill({ env: { WEBFLOW_API_TOKEN: 'secret-token' }, fetchImpl });
  printDryRun(report, (line) => logs.push(line));
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.summary.readyToUpdate, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls.some((call) => call.options.method === 'PATCH'), false);
  assert.equal(JSON.stringify(logs).includes('secret-token'), false);
});

test('--apply writes only published-iso to staged and live batch endpoints and verifies state', async () => {
  const calls = [];
  const current = item();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (!options.method || options.method === 'GET') {
      if (String(url).includes('/items?')) return jsonResponse({ items: [current], pagination: { total: 1 } });
      return jsonResponse({ ...current, fieldData: { ...current.fieldData, 'published-iso': '2026-07-07T21:14:58.123Z' } });
    }
    return jsonResponse({ id: current.id });
  };
  const report = await runBackfill({ apply: true, env: { WEBFLOW_API_TOKEN: 'secret-token' }, fetchImpl });
  const patchCalls = calls.filter((call) => call.options.method === 'PATCH');
  assert.equal(patchCalls.length, 2);
  assert.match(patchCalls[0].url, /\/collections\/6a4d6ad32871d46ed1edc6a4\/items$/);
  assert.match(patchCalls[1].url, /\/collections\/6a4d6ad32871d46ed1edc6a4\/items\/live$/);
  for (const call of patchCalls) {
    assert.deepEqual(JSON.parse(call.options.body), {
      items: [{
        id: 'item-1',
        cmsLocaleId: 'locale-1',
        fieldData: { 'published-iso': '2026-07-07T21:14:58.123Z' },
      }],
    });
    assert.equal(call.url.includes('cmsLocaleId='), false);
  }
  const row = report.rows.find((entry) => entry.action === 'update');
  assert.equal(row.stagedUpdateStatus, 'success');
  assert.equal(row.liveUpdateStatus, 'success');
  assert.equal(row.verificationStatus, 'success');
  assert.equal(row.verifiedPublishedDate, '2026-07-07T21:14:58.123Z');
});

test('partial live update failure is reported after staged update succeeds', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      if (String(url).includes('/items?')) return jsonResponse({ items: [item()], pagination: { total: 1 } });
      return jsonResponse(item());
    }
    if (String(url).includes('/live')) return jsonResponse({ error: 'failed' }, 500);
    return jsonResponse({ id: 'item-1' });
  };
  const report = await runBackfill({ apply: true, env: { WEBFLOW_API_TOKEN: 'secret-token' }, fetchImpl });
  const row = report.rows.find((entry) => entry.action === 'update');
  assert.equal(row.stagedUpdateStatus, 'success');
  assert.equal(row.liveUpdateStatus, 'failed');
  assert.equal(row.verificationStatus, 'failed');
  assert.match(row.error, /Webflow API PATCH/);
});

test('--limit=1 restricts apply to first eligible item by item ID', async () => {
  const calls = [];
  const first = item({ id: 'b-item', cmsLocaleId: 'locale-b' });
  const second = item({ id: 'a-item', cmsLocaleId: 'locale-a', createdOn: '2026-07-08T01:02:03.004Z' });
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (!options.method || options.method === 'GET') {
      if (String(url).includes('/items?')) return jsonResponse({ items: [first, second], pagination: { total: 2 } });
      const id = String(url).includes('a-item') ? 'a-item' : 'b-item';
      const source = id === 'a-item' ? second : first;
      return jsonResponse({ ...source, fieldData: { ...source.fieldData, 'published-iso': publishedIsoFromPublishedDate(source.fieldData['published-date']) } });
    }
    return jsonResponse({ ok: true });
  };
  const report = await runBackfill({ apply: true, limit: 1, env: { WEBFLOW_API_TOKEN: 'secret-token' }, fetchImpl });
  const patchBody = JSON.parse(calls.find((call) => call.options.method === 'PATCH').options.body);
  assert.equal(patchBody.items.length, 1);
  assert.equal(patchBody.items[0].id, 'a-item');
  assert.equal(report.rows.find((row) => row.itemId === 'b-item').reason, 'canary-limit-not-selected');
});

test('batching is capped at 100 items per Webflow request', () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ itemId: `item-${index}` }));
  const chunks = chunkRows(rows, 100);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[1].length, 1);
});

test('example batch bodies contain only id, cmsLocaleId and published-iso fieldData', () => {
  const report = {
    rows: [{
      action: 'update',
      itemId: 'item-1',
      cmsLocaleId: 'locale-1',
      proposedPublishedIso: '2026-07-07T21:14:58.123Z',
    }],
  };
  assert.deepEqual(exampleBatchBodies(report), {
    staged: { items: [{ id: 'item-1', cmsLocaleId: 'locale-1', fieldData: { 'published-iso': '2026-07-07T21:14:58.123Z' } }] },
    live: { items: [{ id: 'item-1', cmsLocaleId: 'locale-1', fieldData: { 'published-iso': '2026-07-07T21:14:58.123Z' } }] },
  });
});

test('audit files from separate runs do not overwrite one another', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'news-iso-report-'));
  const first = { mode: 'apply', runTimestamp: '2026-07-28T00:07:19.736Z', collectionId: 'collection', rows: [] };
  const second = { mode: 'dry-run', runTimestamp: '2026-07-28T00:10:00.000Z', collectionId: 'collection', rows: [] };
  const firstPaths = reportPaths(first);
  const secondPaths = reportPaths(second);
  assert.notEqual(firstPaths.jsonPath, secondPaths.jsonPath);
  const writtenFirst = await writeReports(first, {
    jsonPath: path.join(tempDir, path.basename(firstPaths.jsonPath)),
    csvPath: path.join(tempDir, path.basename(firstPaths.csvPath)),
  });
  const writtenSecond = await writeReports(second, {
    jsonPath: path.join(tempDir, path.basename(secondPaths.jsonPath)),
    csvPath: path.join(tempDir, path.basename(secondPaths.csvPath)),
  });
  assert.notEqual(writtenFirst.jsonPath, writtenSecond.jsonPath);
  assert.equal(JSON.parse(await readFile(writtenFirst.jsonPath, 'utf8')).mode, 'apply');
  assert.equal(JSON.parse(await readFile(writtenSecond.jsonPath, 'utf8')).mode, 'dry-run');
});

test('parseArgs supports canary limit', () => {
  assert.deepEqual(parseArgs(['--apply', '--limit=1']), { apply: true, force: false, limit: 1 });
  assert.throws(() => parseArgs(['--limit=0']), /--limit must be a positive integer/);
});

test('parseDevVars reads token values without printing them', () => {
  const parsed = parseDevVars("WEBFLOW_API_TOKEN='secret-token'\nWEBFLOW_NEWS_COLLECTION_ID=collection-1\n");
  assert.equal(parsed.WEBFLOW_API_TOKEN, 'secret-token');
  assert.equal(parsed.WEBFLOW_NEWS_COLLECTION_ID, 'collection-1');
});
