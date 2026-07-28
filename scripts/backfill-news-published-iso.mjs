import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEWS_COLLECTION_ID = '6a4d6ad32871d46ed1edc6a4';
export const REPORT_DIR = 'tmp';
export const REPORT_BASENAME = 'news-published-iso-backfill';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';
const MAX_LIMIT = 100;

export function parseArgs(argv = []) {
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : 0;
  if (limitArg && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer.');
  return {
    apply: argv.includes('--apply'),
    force: argv.includes('--force'),
    limit,
  };
}

export function parseDevVars(text = '') {
  const vars = {};
  String(text || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) return;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[match[1]] = value;
  });
  return vars;
}

export async function loadDevVars(filePath = 'worker/.dev.vars') {
  return parseDevVars(await readFile(filePath, 'utf8'));
}

export function webflowToken(env = {}) {
  const token = env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN || '';
  if (!token) throw new Error('Missing Webflow API token in worker/.dev.vars.');
  return token;
}

function itemId(item = {}) {
  return item.id || item._id || '';
}

function itemName(item = {}) {
  return item.fieldData?.name || item.fieldData?.title || item.name || '';
}

function itemSlug(item = {}) {
  return item.fieldData?.slug || item.slug || '';
}

function currentPublishedIso(item = {}) {
  return item.fieldData?.['published-iso'];
}

export function publishedIsoFromPublishedDate(sourcePublishedDate) {
  if (sourcePublishedDate === null || sourcePublishedDate === undefined || String(sourcePublishedDate).trim() === '') return '';
  const parsed = new Date(sourcePublishedDate);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function timestampMs(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  return new Date(value).getTime();
}

export function classifyItems(items = [], options = {}) {
  const force = options.force === true;
  const summary = {
    totalFetched: items.length,
    publishedNonArchived: 0,
    draftSkipped: 0,
    archivedSkipped: 0,
    neverPublishedSkipped: 0,
    alreadyPopulated: 0,
    missingPublishedIso: 0,
    matchingPublishedIso: 0,
    mismatchedPublishedIso: 0,
    invalidExistingPublishedIso: 0,
    missingPublishedDate: 0,
    invalidPublishedDate: 0,
    readyToUpdate: 0,
  };
  const rows = [];

  for (const item of items) {
    const id = itemId(item);
    const oldPublishedIso = currentPublishedIso(item);
    const base = {
      itemId: id,
      name: itemName(item),
      slug: itemSlug(item),
      cmsLocaleId: item.cmsLocaleId || '',
      createdOn: item.createdOn || '',
      sourcePublishedDate: item.fieldData?.['published-date'] ?? '',
      oldPublishedIso: oldPublishedIso == null ? '' : String(oldPublishedIso),
      oldPublishedDate: item.fieldData?.['published-date'] ?? '',
      oldLastUpdated: item.lastUpdated || '',
      verifiedPublishedIso: '',
      verifiedPublishedDate: '',
      verifiedIsDraft: '',
      verifiedIsArchived: '',
      verifiedLastPublished: '',
      verifiedLastUpdated: '',
      proposedPublishedIso: '',
      stagedUpdateStatus: 'not-run',
      liveUpdateStatus: 'not-run',
      verificationStatus: 'not-run',
      error: '',
    };

    if (item.isDraft === true) {
      summary.draftSkipped += 1;
      rows.push({ ...base, action: 'skip', reason: 'draft' });
      continue;
    }
    if (item.isArchived === true) {
      summary.archivedSkipped += 1;
      rows.push({ ...base, action: 'skip', reason: 'archived' });
      continue;
    }
    if (!item.lastPublished) {
      summary.neverPublishedSkipped += 1;
      rows.push({ ...base, action: 'skip', reason: 'never-published' });
      continue;
    }

    summary.publishedNonArchived += 1;
    const sourcePublishedDate = item.fieldData?.['published-date'];
    if (sourcePublishedDate === null || sourcePublishedDate === undefined || String(sourcePublishedDate).trim() === '') {
      summary.missingPublishedDate += 1;
      rows.push({ ...base, action: 'skip', reason: 'missing-published-date', error: 'Missing published-date field.' });
      continue;
    }
    const publishedIso = publishedIsoFromPublishedDate(sourcePublishedDate);
    if (!publishedIso) {
      summary.invalidPublishedDate += 1;
      rows.push({ ...base, action: 'skip', reason: 'invalid-published-date', error: 'Invalid published-date field.' });
      continue;
    }

    const hasPublishedIso = String(oldPublishedIso || '').trim().length > 0;
    if (!hasPublishedIso) {
      summary.missingPublishedIso += 1;
      summary.readyToUpdate += 1;
      rows.push({ ...base, action: 'update', reason: 'missing-published-iso', proposedPublishedIso: publishedIso });
      continue;
    }

    const existingMs = timestampMs(oldPublishedIso);
    const expectedMs = timestampMs(publishedIso);
    if (!Number.isNaN(existingMs) && existingMs === expectedMs) {
      summary.matchingPublishedIso += 1;
      summary.alreadyPopulated += 1;
      rows.push({ ...base, action: force ? 'update' : 'skip', reason: force ? 'force' : 'matching-published-iso', proposedPublishedIso: publishedIso });
      if (force) summary.readyToUpdate += 1;
      continue;
    }

    if (Number.isNaN(existingMs)) summary.invalidExistingPublishedIso += 1;
    summary.mismatchedPublishedIso += 1;
    summary.readyToUpdate += 1;
    rows.push({ ...base, action: 'update', reason: Number.isNaN(existingMs) ? 'invalid-existing-published-iso' : (force ? 'force' : 'mismatched-published-iso'), proposedPublishedIso: publishedIso });
  }

  return { summary, rows };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function webflowRequest(pathname, { token, method = 'GET', body, fetchImpl = fetch, retries = 3 } = {}) {
  const url = pathname.startsWith('http') ? pathname : WEBFLOW_API_BASE + pathname;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }

    if (response.status === 429 && attempt < retries) {
      const retryAfter = Number(response.headers.get('Retry-After') || 0);
      await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * (attempt + 1), 5000));
      continue;
    }

    if (!response.ok) {
      const error = new Error(`Webflow API ${method} ${pathname} failed with ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data || {};
  }
  throw new Error(`Webflow API ${method} ${pathname} failed after retries.`);
}

function collectionItemPath(collectionId, id) {
  return `/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(id)}`;
}

function collectionBatchPath(collectionId, live = false) {
  return `/collections/${encodeURIComponent(collectionId)}/items${live ? '/live' : ''}`;
}

export async function fetchAllItems({ token, collectionId = NEWS_COLLECTION_ID, fetchImpl = fetch } = {}) {
  const items = [];
  for (let offset = 0; ; offset += MAX_LIMIT) {
    const data = await webflowRequest(`/collections/${encodeURIComponent(collectionId)}/items?limit=${MAX_LIMIT}&offset=${offset}`, { token, fetchImpl });
    const pageItems = Array.isArray(data.items) ? data.items : [];
    items.push(...pageItems);
    const total = Number(data.pagination?.total ?? data.total ?? items.length);
    if (!pageItems.length || items.length >= total) break;
  }
  return items;
}

export function updateItemForRow(row) {
  return {
    id: row.itemId,
    cmsLocaleId: row.cmsLocaleId,
    fieldData: {
      'published-iso': row.proposedPublishedIso,
    },
  };
}

export function chunkRows(rows = [], size = MAX_LIMIT) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

async function verifyUpdatedRows(rows, { token, collectionId, fetchImpl }) {
  for (const row of rows) {
    const verified = await webflowRequest(collectionItemPath(collectionId, row.itemId), { token, fetchImpl });
    const verifiedIso = verified.fieldData?.['published-iso'];
    row.verifiedPublishedIso = verifiedIso == null ? '' : String(verifiedIso);
    row.verifiedPublishedDate = verified.fieldData?.['published-date'] ?? '';
    row.verifiedIsDraft = verified.isDraft === true;
    row.verifiedIsArchived = verified.isArchived === true;
    row.verifiedLastPublished = verified.lastPublished || '';
    row.verifiedLastUpdated = verified.lastUpdated || '';
    const verifiedPublishedDate = verified.fieldData?.['published-date'];
    const expectedIso = publishedIsoFromPublishedDate(verifiedPublishedDate);
    if (verifiedIso !== row.proposedPublishedIso) throw new Error(`Verification failed for ${row.itemId}: published-iso did not match proposed value.`);
    if (verifiedIso !== expectedIso) throw new Error(`Verification failed for ${row.itemId}: published-iso did not match published-date.`);
    if (verifiedPublishedDate !== row.sourcePublishedDate) throw new Error(`Verification failed for ${row.itemId}: published-date changed.`);
    if (verified.isDraft === true) throw new Error(`Verification failed for ${row.itemId}: item became a draft.`);
    if (verified.isArchived === true) throw new Error(`Verification failed for ${row.itemId}: item became archived.`);
    if (!verified.lastPublished) throw new Error(`Verification failed for ${row.itemId}: item is no longer published.`);
  }
}

export async function updatePublishedIsoBatch(rows, { token, collectionId = NEWS_COLLECTION_ID, fetchImpl = fetch } = {}) {
  const body = { items: rows.map(updateItemForRow) };
  const staged = await webflowRequest(collectionBatchPath(collectionId, false), { token, method: 'PATCH', body, fetchImpl });
  let live = null;
  try {
    live = await webflowRequest(collectionBatchPath(collectionId, true), { token, method: 'PATCH', body, fetchImpl });
  } catch (error) {
    error.stagedCompleted = true;
    throw error;
  }
  await verifyUpdatedRows(rows, { token, collectionId, fetchImpl });
  return { staged, live };
}

export async function runBackfill({ apply = false, force = false, limit = 0, env = {}, fetchImpl = fetch, collectionId = NEWS_COLLECTION_ID } = {}) {
  const token = webflowToken(env);
  const items = await fetchAllItems({ token, collectionId, fetchImpl });
  const result = classifyItems(items, { force });
  const reportRows = result.rows.map((row) => ({ ...row }));

  if (apply) {
    const updateRows = reportRows
      .filter((entry) => entry.action === 'update')
      .sort((a, b) => a.itemId.localeCompare(b.itemId));
    const selectedRows = limit ? updateRows.slice(0, limit) : updateRows;
    const selectedIds = new Set(selectedRows.map((row) => row.itemId));
    for (const row of updateRows) {
      if (!selectedIds.has(row.itemId)) row.reason = 'canary-limit-not-selected';
    }
    for (const batch of chunkRows(selectedRows, MAX_LIMIT)) {
      try {
        await updatePublishedIsoBatch(batch, { token, collectionId, fetchImpl });
        for (const row of batch) {
          row.stagedUpdateStatus = 'success';
          row.liveUpdateStatus = 'success';
          row.verificationStatus = 'success';
        }
      } catch (error) {
        for (const row of batch) {
          row.stagedUpdateStatus = error.stagedCompleted ? 'success' : 'failed';
          row.liveUpdateStatus = error.stagedCompleted ? 'failed' : 'not-run';
          row.verificationStatus = 'failed';
          row.error = error.message;
        }
        break;
      }
    }
  }

  return {
    mode: apply ? 'apply' : 'dry-run',
    force,
    limit,
    runTimestamp: new Date().toISOString(),
    collectionId,
    summary: result.summary,
    rows: reportRows,
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportToCsv(report) {
  const headers = ['runMode','collectionId','itemId','name','slug','cmsLocaleId','sourcePublishedDate','oldPublishedIso','proposedPublishedIso','oldPublishedDate','verifiedPublishedIso','verifiedPublishedDate','verifiedIsDraft','verifiedIsArchived','verifiedLastPublished','oldLastUpdated','verifiedLastUpdated','createdOn','action','reason','stagedUpdateStatus','liveUpdateStatus','verificationStatus','error'];
  return [
    headers.join(','),
    ...report.rows.map((row) => headers.map((header) => csvEscape(header === 'runMode' ? report.mode : header === 'collectionId' ? report.collectionId : row[header])).join(',')),
  ].join('\n') + '\n';
}

export async function writeReports(report, { jsonPath, csvPath } = {}) {
  if (!jsonPath || !csvPath) {
    const paths = reportPaths(report);
    jsonPath = jsonPath || paths.jsonPath;
    csvPath = csvPath || paths.csvPath;
  }
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n');
  await writeFile(csvPath, reportToCsv(report));
  return { jsonPath, csvPath };
}

export function reportPaths(report) {
  const stamp = String(report.runTimestamp || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const mode = String(report.mode || 'run').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const base = path.join(REPORT_DIR, `${REPORT_BASENAME}-${mode}-${stamp}`);
  return { jsonPath: `${base}.json`, csvPath: `${base}.csv` };
}

export function printDryRun(report, log = console.log) {
  const s = report.summary;
  log(`Mode: ${report.mode}`);
  log(`Total items fetched: ${s.totalFetched}`);
  log(`Published and non-archived items: ${s.publishedNonArchived}`);
  log(`Draft items skipped: ${s.draftSkipped}`);
  log(`Archived items skipped: ${s.archivedSkipped}`);
  log(`Never-published items skipped: ${s.neverPublishedSkipped}`);
  log(`Missing published-iso values: ${s.missingPublishedIso}`);
  log(`Matching published-iso values: ${s.matchingPublishedIso}`);
  log(`Mismatched published-iso values: ${s.mismatchedPublishedIso}`);
  log(`Invalid existing published-iso values: ${s.invalidExistingPublishedIso}`);
  log(`Missing published-date fields: ${s.missingPublishedDate}`);
  log(`Invalid published-date fields: ${s.invalidPublishedDate}`);
  log(`Number ready to update: ${s.readyToUpdate}`);
  for (const row of report.rows.filter((entry) => entry.reason === 'mismatched-published-iso' || entry.reason === 'invalid-existing-published-iso')) {
    log([
      `mismatch item ID: ${row.itemId}`,
      `name: ${row.name}`,
      `slug: ${row.slug}`,
      `published-date: ${row.sourcePublishedDate}`,
      `existing published-iso: ${row.oldPublishedIso}`,
      `corrected published-iso: ${row.proposedPublishedIso}`,
    ].join(' | '));
  }
  for (const row of report.rows.filter((entry) => entry.action === 'update')) {
    log([
      `item ID: ${row.itemId}`,
      `name: ${row.name}`,
      `slug: ${row.slug}`,
      `cmsLocaleId: ${row.cmsLocaleId}`,
      `source published-date: ${row.sourcePublishedDate}`,
      `existing published-iso: ${row.oldPublishedIso}`,
      `proposed published-iso: ${row.proposedPublishedIso}`,
    ].join(' | '));
  }
}

export function exampleBatchBodies(report) {
  const row = report.rows
    .filter((entry) => entry.action === 'update')
    .sort((a, b) => a.itemId.localeCompare(b.itemId))[0];
  if (!row) return null;
  const body = { items: [updateItemForRow(row)] };
  return { staged: body, live: body };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await loadDevVars('worker/.dev.vars');
  const report = await runBackfill({ apply: args.apply, force: args.force, limit: args.limit, env });
  const reportFiles = await writeReports(report, {});
  printDryRun(report);
  console.log(`Audit report: ${reportFiles.jsonPath}`);
  console.log(`Audit CSV: ${reportFiles.csvPath}`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
