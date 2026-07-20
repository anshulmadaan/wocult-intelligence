import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function functionBlock(name) {
  const start = html.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < html.length; index += 1) {
    const char = html[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

test('News Brief submission uses authenticated Worker fetch for Webflow draft creation', () => {
  const createDraft = functionBlock('createNewsBriefWebflowDraft');
  assert.match(createDraft, /workerFetchWithFirebaseAuth\('\/webflow-news'/);
  assert.doesNotMatch(createDraft, /fetch\(WORKER \+ '\/webflow-news'/);
  assert.match(createDraft, /existingWebflowMetadata\(docId\)/);
  assert.match(createDraft, /updateArticleWebflowMetadata\(docId, webflowData, \{/);
  assert.match(createDraft, /collectionName: 'News'/);
});

function loadAuthHarness(overrides = {}) {
  const calls = [];
  const context = {
    WORKER: 'https://worker.test',
    currentUser: {
      getIdToken: async (forceRefresh) => (forceRefresh ? 'firebase-id-token-refreshed' : 'firebase-id-token'),
    },
    Headers,
    Response,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ id: 'wf-item-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    console: { warn() {} },
    existingWebflowMetadata: async () => null,
    buildNewsBriefFieldData: () => ({ name: 'Test headline', slug: 'test-headline', body: '<p>Body</p>' }),
    updateArticleWebflowMetadata: async () => {},
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('plainHeaders'),
    functionBlock('getCurrentUserIdToken'),
    functionBlock('workerFetchWithFirebaseAuth'),
    functionBlock('parseWorkerResponse'),
    functionBlock('createNewsBriefWebflowDraft'),
  ].join('\n'), context);
  return { context, calls };
}

test('createNewsBriefWebflowDraft sends Firebase bearer token and JSON content type', async () => {
  const { context, calls } = loadAuthHarness();
  await context.createNewsBriefWebflowDraft('article-1', { title: 'Test headline' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://worker.test/webflow-news');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
});

test('Webflow auth retry refreshes token once after 401 without changing Firebase state', async () => {
  let tokenCalls = 0;
  const calls = [];
  const { context } = loadAuthHarness({
    currentUser: {
      getIdToken: async (forceRefresh) => {
        tokenCalls += 1;
        return forceRefresh ? 'fresh-token' : 'stale-token';
      },
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const status = calls.length === 1 ? 401 : 200;
      return new Response(JSON.stringify(status === 401 ? { ok: false, error: 'Unauthorized' } : { id: 'wf-item-1' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  await context.createNewsBriefWebflowDraft('article-1', { title: 'Test headline' });
  assert.equal(tokenCalls, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer stale-token');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fresh-token');
});

test('Missing Firebase user fails before Webflow request with session message', async () => {
  const { context, calls } = loadAuthHarness({ currentUser: null });
  await assert.rejects(
    context.createNewsBriefWebflowDraft('article-1', { title: 'Test headline' }),
    /Your session has expired\. Please sign in again\./
  );
  assert.equal(calls.length, 0);
});

test('News Brief submit path records Firebase success before Webflow and prevents double submit', () => {
  const submit = functionBlock('submitNewsBriefArticle');
  assert.match(submit, /newsBriefSubmissionState\.inFlight/);
  assert.match(submit, /btn\.textContent = 'Saving to Firebase\.\.\.'/);
  assert.match(submit, /saveArticleToFirebase\(newsData, 'submitted'\)/);
  assert.match(submit, /newsBriefSubmissionState\.firebaseDocId = submittedDocId/);
  assert.match(submit, /btn\.textContent = 'Creating Webflow draft\.\.\.'/);
  assert.match(submit, /createNewsBriefWebflowDraft\(submittedDocId, newsData\)/);
  assert.doesNotMatch(submit, /fetch\(WORKER \+ '\/webflow-news'/);
});

test('News Brief Webflow failure state preserves Firebase save and retries only Webflow', () => {
  const failure = functionBlock('renderNewsBriefWebflowFailure');
  const retry = functionBlock('retryNewsBriefWebflowSubmission');
  assert.match(failure, /News brief saved to Firebase/);
  assert.match(failure, /Webflow News draft could not be created/);
  assert.match(failure, /Retry Webflow/);
  assert.match(retry, /newsBriefSubmissionState\.firebaseDocId/);
  assert.match(retry, /createNewsBriefWebflowDraft\(newsBriefSubmissionState\.firebaseDocId, newsBriefSubmissionState\.articleData\)/);
  assert.doesNotMatch(retry, /saveArticleToFirebase/);
});

test('News Brief success confirms Webflow draft and offers existing social workflow', () => {
  const success = functionBlock('renderNewsBriefSubmissionSuccess');
  assert.match(success, /offerNewsBriefSocialWorkflow/);
  assert.match(success, /isNewsBriefImageSelectionEnabled/);
  assert.match(success, /openNewsBriefImageSelection/);
  assert.match(success, /News brief saved/);
  assert.match(success, /created as a Webflow News draft/);
  assert.match(success, /Work on socials/);
  assert.match(success, /startNewsBriefSocialWorkflow/);
});

test('Optional News Brief image selection is feature flagged and forced when enabled', () => {
  assert.match(html, /var NEWS_BRIEF_IMAGE_SELECTION_ENABLED = false/);
  assert.match(html, /function isNewsBriefImageSelectionEnabled/);
  assert.match(html, /Choose an image for this News Brief/);
  assert.match(html, /Select an Unsplash image, upload your own, or skip and add one later from the Editorial Tracker\./);
  assert.match(html, /id="news-brief-image-modal"/);
  assert.match(html, /Skip for now/);
  assert.match(functionBlock('preventNewsBriefImageEscape'), /event\.key === 'Escape'/);
});

test('News Brief image search, crop, filename and skip paths preserve submitted article state', () => {
  assert.match(functionBlock('deriveNewsBriefImageKeywords'), /generic/);
  assert.match(functionBlock('searchNewsBriefUnsplash'), /newsBriefImageState\.query = query/);
  assert.match(functionBlock('searchNewsBriefUnsplash'), /\/news-briefs\/unsplash-search/);
  assert.match(functionBlock('handleNewsBriefComputerImage'), /\^image\\\/\(jpeg\|png\|webp\)\$/);
  assert.match(functionBlock('getNewsBriefCropDrawRect'), /1050/);
  assert.match(functionBlock('getNewsBriefCropDrawRect'), /700/);
  assert.match(functionBlock('canvasToJpegBlob'), /image\/jpeg/);
  assert.match(functionBlock('processNewsBriefImageOutput'), /100 \* 1024/);
  assert.match(functionBlock('buildNewsBriefImageFilename'), /wocult-/);
  assert.match(functionBlock('skipNewsBriefImageSelection'), /markNewsBriefImagePending/);
  assert.doesNotMatch(functionBlock('skipNewsBriefImageSelection'), /createNewsBriefWebflowDraft/);
  assert.doesNotMatch(functionBlock('useSelectedNewsBriefImage'), /saveArticleToFirebase/);
});

test('Image upload success hands the Webflow image URL directly to social workflow', () => {
  const useImage = functionBlock('useSelectedNewsBriefImage');
  assert.match(useImage, /\/news-briefs\/image/);
  assert.match(useImage, /webflowImageUrl/);
  assert.match(useImage, /proceedToNewsBriefSocialWorkflow\(updatedArticle\)/);
  assert.match(functionBlock('proceedToNewsBriefSocialWorkflow'), /offerNewsBriefSocialWorkflow/);
  assert.match(functionBlock('proceedToNewsBriefSocialWorkflow'), /startNewsBriefSocialWorkflow/);
});

test('Editorial Tracker shows News Brief image state and reuses the image interface', () => {
  assert.match(functionBlock('renderEditorialTracker'), /editorialTrackerImageStateHtml/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /Image pending/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /Add image/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /Image added/);
  assert.match(functionBlock('openEditorialTrackerNewsBriefImage'), /openNewsBriefImageSelection/);
  assert.doesNotMatch(functionBlock('openEditorialTrackerNewsBriefImage'), /saveArticleToFirebase/);
});

test('Existing LinkedIn, Editorial Calendar, Automated News Brief and long-form paths remain present', () => {
  assert.match(html, /function offerNewsBriefSocialWorkflow/);
  assert.match(html, /function startNewsBriefSocialWorkflow/);
  assert.match(html, /function saveNewsBriefSocialToCalendar/);
  assert.match(html, /function showEditorialCalendar/);
  assert.match(html, /function showAutomatedNewsBriefs/);
  assert.match(html, /function submitArticle/);
  assert.match(html, /function createLongViewWebflowDraft/);
  assert.match(html, /workerFetchWithFirebaseAuth\('\/webflow-posts'/);
  assert.doesNotMatch(functionBlock('submitArticle'), /webflow-from-firebase/);
});

test('Manual long-view workflow and shared social success path are present', () => {
  assert.match(html, /Manual long-view story/);
  assert.match(html, /function prepareManualLongViewCmsFields/);
  assert.match(html, /function submitManualLongViewToCms/);
  assert.match(html, /Submit to Firebase \+ THA Posts/);
  assert.match(functionBlock('offerNewsBriefSocialWorkflow'), /contentType === 'long_form'/);
  assert.match(functionBlock('renderLongViewSubmissionSuccess'), /Work on socials/);
});

test('Long-view Webflow submission uses authenticated Worker fetch and idempotency check', () => {
  const createDraft = functionBlock('createLongViewWebflowDraft');
  assert.match(createDraft, /existingWebflowMetadata\(docId\)/);
  assert.match(createDraft, /workerFetchWithFirebaseAuth\('\/webflow-posts'/);
  assert.match(createDraft, /collectionName: 'THA Posts'/);
  assert.match(createDraft, /collectionId: THA_POSTS_COLLECTION_ID/);
});
