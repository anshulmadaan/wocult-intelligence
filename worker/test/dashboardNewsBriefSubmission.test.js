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
  const renderContext = functionBlock('renderNewsBriefSubmissionSuccessFromContext');
  assert.match(renderContext, /offerNewsBriefSocialWorkflow/);
  assert.match(renderContext, /isNewsBriefPostSubmitImagePromptEnabled/);
  assert.match(renderContext, /openNewsBriefImageSelection\(socialContext, \{mode:'postSubmit'\}\)/);
  assert.match(renderContext, /News brief saved/);
  assert.match(renderContext, /created as a Webflow News draft/);
  assert.match(renderContext, /Work on socials/);
  assert.match(renderContext, /startNewsBriefSocialWorkflow/);
  assert.match(success, /renderNewsBriefSubmissionSuccessFromContext/);
});

test('News Brief image tools are enabled while the forced post-submit prompt stays disabled', () => {
  assert.match(html, /var NEWS_BRIEF_POST_SUBMIT_IMAGE_PROMPT_ENABLED = false/);
  assert.match(html, /var NEWS_BRIEF_IMAGE_TOOLS_ENABLED = true/);
  assert.match(html, /function isNewsBriefPostSubmitImagePromptEnabled/);
  assert.match(html, /function isNewsBriefImageToolsEnabled/);
  assert.match(html, /Choose an image for this News Brief/);
  assert.match(html, /id="news-brief-image-modal"/);
  assert.match(html, /Choose image/);
  assert.match(html, /News image — optional/);
  assert.match(html, /Cancel/);
  assert.match(functionBlock('preventNewsBriefImageEscape'), /event\.key === 'Escape'/);
  assert.match(functionBlock('preventNewsBriefImageEscape'), /closeNewsBriefImageSelection/);
  assert.match(functionBlock('handleNewsBriefImageBackdrop'), /closeNewsBriefImageSelection/);
});

test('News Brief image modal is hoisted above dashboard forms before display', () => {
  const ensureLayer = functionBlock('ensureNewsBriefImageModalLayer');
  const openImage = functionBlock('openNewsBriefImageSelection');
  assert.match(html, /\.news-image-modal\{[^}]*position:fixed[^}]*z-index:10120/);
  assert.match(html, /id="landing-manual-news-review"/);
  assert.match(html, /id="news-brief-social-modal"[^>]*z-index:10050/);
  assert.match(ensureLayer, /document\.getElementById\('news-brief-image-modal'\)/);
  assert.match(ensureLayer, /modal\.parentElement !== document\.body/);
  assert.match(ensureLayer, /document\.body\.appendChild\(modal\)/);
  assert.match(ensureLayer, /modal\.style\.position = 'fixed'/);
  assert.match(ensureLayer, /modal\.style\.zIndex = '10120'/);
  assert.match(openImage, /var modal = ensureNewsBriefImageModalLayer\(\)/);
  assert.match(openImage, /modal\.style\.display = 'flex'/);
  assert.match(functionBlock('openPreSubmitNewsBriefImageSelection'), /openNewsBriefImageSelection/);
  assert.match(functionBlock('openEditorialTrackerNewsBriefImage'), /openNewsBriefImageSelection/);
});

test('News Brief image modal close paths restore scrolling and keep one modal element', () => {
  const closeImage = functionBlock('closeNewsBriefImageSelection');
  assert.match(functionBlock('ensureNewsBriefImageModalLayer'), /appendChild\(modal\)/);
  assert.doesNotMatch(functionBlock('ensureNewsBriefImageModalLayer'), /cloneNode|createElement/);
  assert.match(functionBlock('openNewsBriefImageSelection'), /modal\.dataset\.previousBodyOverflow/);
  assert.match(functionBlock('openNewsBriefImageSelection'), /document\.body\.style\.overflow = 'hidden'/);
  assert.match(closeImage, /document\.body\.style\.overflow = modal\.dataset\.previousBodyOverflow/);
  assert.match(closeImage, /delete modal\.dataset\.previousBodyOverflow/);
  assert.match(functionBlock('preventNewsBriefImageEscape'), /closeNewsBriefImageSelection/);
  assert.match(functionBlock('handleNewsBriefImageBackdrop'), /closeNewsBriefImageSelection/);
  assert.match(functionBlock('skipNewsBriefImageSelection'), /closeNewsBriefImageSelection/);
  assert.match(functionBlock('storeNewsBriefPreSubmitImage'), /renderNewsBriefPreSubmitImagePreview/);
});

test('Pre-submit News Brief image selection stores a temporary image before submission', () => {
  assert.match(functionBlock('openPreSubmitNewsBriefImageSelection'), /mode:'preSubmit'/);
  assert.match(functionBlock('useSelectedNewsBriefImage'), /newsBriefImageState\.mode === 'preSubmit'/);
  assert.match(functionBlock('storeNewsBriefPreSubmitImage'), /newsBriefPreSubmitImageState = \{/);
  assert.match(functionBlock('storeNewsBriefPreSubmitImage'), /URL\.createObjectURL/);
  assert.match(functionBlock('renderNewsBriefPreSubmitImagePreview'), /Selected image/);
  assert.match(functionBlock('renderNewsBriefPreSubmitImagePreview'), /Change image/);
  assert.match(functionBlock('renderNewsBriefPreSubmitImagePreview'), /Remove image/);
  assert.match(functionBlock('removeNewsBriefPreSubmitImage'), /clearNewsBriefPreSubmitImage/);
  assert.match(functionBlock('clearNewsBriefPreSubmitImage'), /URL\.revokeObjectURL/);
});

test('No-image News Brief submission skips the image route and preserves manual image URL support', () => {
  assert.match(functionBlock('collectNewsBriefData'), /selectedImageActive \? '' : \(cmsFieldValue\('r-news-image'\) \|\| cmsFieldValue\('r-img-url'\)\)/);
  assert.match(functionBlock('collectManualNewsBriefReviewData'), /selectedImageActive \? '' : document\.getElementById\('manual-review-news-image'\)\.value\.trim\(\)/);
  assert.match(functionBlock('uploadPreSubmitNewsBriefImageIfNeeded'), /!newsBriefPreSubmitImageState\.selected/);
  assert.match(functionBlock('uploadPreSubmitNewsBriefImageIfNeeded'), /return Promise\.resolve\(socialContext\)/);
  assert.doesNotMatch(functionBlock('uploadPreSubmitNewsBriefImageIfNeeded').split('return Promise.resolve(socialContext)')[0], /\/news-briefs\/image/);
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
  assert.match(functionBlock('uploadNewsBriefImageToWorker'), /\/news-briefs\/image/);
  assert.match(useImage, /webflowImageUrl/);
  assert.match(useImage, /proceedToNewsBriefSocialWorkflow\(updatedArticle\)/);
  assert.match(functionBlock('completeNewsBriefSubmission'), /uploadPreSubmitNewsBriefImageIfNeeded/);
  assert.match(functionBlock('uploadPreSubmitNewsBriefImageIfNeeded'), /uploadNewsBriefImageToWorker\(socialContext, selected\.blob, selected\)/);
  assert.match(functionBlock('uploadPreSubmitNewsBriefImageIfNeeded'), /imageUploadFailed:true/);
  assert.match(functionBlock('proceedToNewsBriefSocialWorkflow'), /offerNewsBriefSocialWorkflow/);
  assert.match(functionBlock('proceedToNewsBriefSocialWorkflow'), /startNewsBriefSocialWorkflow/);
});

test('Editorial Tracker shows News Brief image state and reuses the image interface', () => {
  assert.match(functionBlock('renderEditorialTracker'), /editorialTrackerImageStateHtml/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /isNewsBriefImageToolsEnabled/);
  assert.doesNotMatch(functionBlock('editorialTrackerImageStateHtml'), /isNewsBriefPostSubmitImagePromptEnabled/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /Image pending/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /Add image/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /Image added/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /raw\.imageStatus === 'completed'/);
  assert.match(functionBlock('editorialTrackerImageStateHtml'), /raw\.imageStatus === 'completed' \|\| raw\.webflowImageUrl/);
  assert.match(functionBlock('openEditorialTrackerNewsBriefImage'), /openNewsBriefImageSelection/);
  assert.match(functionBlock('openEditorialTrackerNewsBriefImage'), /fromTracker:true/);
  assert.doesNotMatch(functionBlock('openEditorialTrackerNewsBriefImage'), /saveArticleToFirebase/);
  assert.doesNotMatch(functionBlock('useSelectedNewsBriefImage'), /createNewsBriefWebflowDraft/);
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
