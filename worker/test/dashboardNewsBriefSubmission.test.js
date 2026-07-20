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

test('Manual News Brief image modal opens with a fresh search session', () => {
  const openManual = functionBlock('openPreSubmitNewsBriefImageSelection');
  const openImage = functionBlock('openNewsBriefImageSelection');
  const resetManual = functionBlock('resetManualNewsBriefImageModalSession');
  assert.match(openManual, /formSource:source \|\| 'manual'/);
  assert.match(openImage, /manualFreshSession = mode === 'preSubmit' && options\.formSource === 'manual'/);
  assert.match(openImage, /resetManualNewsBriefImageModalSession\(newsBriefImageState\.suggestedQuery\)/);
  assert.match(openImage, /setNewsBriefImageTab\('unsplash'\);\s+if \(manualFreshSession\) resetManualNewsBriefImageModalSession/);
  assert.match(resetManual, /newsBriefImageState\.modalSessionId \+= 1/);
  assert.match(resetManual, /newsBriefImageState\.tab = 'unsplash'/);
  assert.match(resetManual, /newsBriefImageState\.query = suggestedQuery \|\| ''/);
  assert.match(resetManual, /newsBriefImageState\.unsplashResults = \[\]/);
  assert.match(resetManual, /newsBriefImageState\.selectedSource = null/);
  assert.match(resetManual, /newsBriefImageState\.selectedImage = null/);
  assert.match(resetManual, /newsBriefImageState\.sourceImage = null/);
  assert.match(resetManual, /picker\.style\.display = 'block'/);
  assert.match(resetManual, /crop\.style\.display = 'none'/);
  assert.match(resetManual, /results\.innerHTML = ''/);
  assert.match(resetManual, /input\.value = newsBriefImageState\.query/);
});

test('Manual News Brief image modal close clears transient crop state but keeps confirmed form image', () => {
  const closeImage = functionBlock('closeNewsBriefImageSelection');
  const resetManual = functionBlock('resetManualNewsBriefImageModalSession');
  assert.match(closeImage, /shouldResetManualSession = newsBriefImageState\.mode === 'preSubmit' && newsBriefImageState\.formSource === 'manual'/);
  assert.match(closeImage, /resetManualNewsBriefImageModalSession\(newsBriefImageState\.suggestedQuery\)/);
  assert.match(resetManual, /URL\.revokeObjectURL\(newsBriefImageState\.outputUrl\)/);
  assert.match(resetManual, /URL\.revokeObjectURL\(newsBriefImageState\.selectedImage\.previewUrl\)/);
  assert.match(resetManual, /newsBriefImageState\.crop = \{zoom:1, x:0, y:0, dragging:false, dragX:0, dragY:0\}/);
  assert.match(resetManual, /newsBriefImageState\.outputBlob = null/);
  assert.match(resetManual, /newsBriefImageState\.outputUrl = ''/);
  assert.match(resetManual, /newsBriefImageState\.outputSize = 0/);
  assert.match(resetManual, /zoom\.value = '1'/);
  assert.match(resetManual, /preview\.removeAttribute\('src'\)/);
  assert.match(resetManual, /canvas\.getContext\('2d'\)\.clearRect/);
  assert.match(resetManual, /newsBriefImageStatus\('', false\)/);
  assert.match(functionBlock('searchNewsBriefUnsplash'), /var sessionId = newsBriefImageState\.modalSessionId/);
  assert.match(functionBlock('searchNewsBriefUnsplash'), /sessionId !== newsBriefImageState\.modalSessionId/);
  assert.match(functionBlock('loadNewsBriefImageForCrop'), /sessionId !== newsBriefImageState\.modalSessionId/);
  assert.match(functionBlock('processNewsBriefImageOutput'), /sessionId !== newsBriefImageState\.modalSessionId/);
  assert.doesNotMatch(resetManual, /newsBriefPreSubmitImageState = \{/);
  assert.match(functionBlock('storeNewsBriefPreSubmitImage'), /if \(newsBriefPreSubmitImageState\.previewUrl\) URL\.revokeObjectURL/);
  assert.match(functionBlock('storeNewsBriefPreSubmitImage'), /newsBriefPreSubmitImageState = \{/);
  assert.match(functionBlock('removeNewsBriefPreSubmitImage'), /clearNewsBriefPreSubmitImage/);
});

test('Manual selector runtime reset keeps confirmed form image out of modal editor state', () => {
  const elements = new Map();
  const makeElement = (id) => ({
    id,
    style: {},
    dataset: {},
    value: '',
    innerHTML: '',
    textContent: '',
    className: '',
    parentElement: { id: 'app-root' },
    disabled: false,
    width: 1050,
    height: 700,
    removeAttribute(name) { this[name] = ''; },
    getContext() { return { clearRect: () => { this.canvasCleared = true; } }; },
  });
  [
    'manual-review-title',
    'manual-review-selected-image',
    'news-brief-image-modal',
    'news-image-search-query',
    'news-brief-image-description',
    'news-image-skip-btn',
    'news-image-use-btn',
    'news-image-unsplash-panel',
    'news-image-upload-panel',
    'news-image-tab-unsplash',
    'news-image-tab-upload',
    'news-brief-image-picker',
    'news-brief-image-crop',
    'news-image-unsplash-results',
    'news-image-zoom',
    'news-image-final-preview',
    'news-image-crop-canvas',
    'news-image-output-meta',
    'news-image-search-btn',
    'news-brief-image-status',
  ].forEach((id) => elements.set(id, makeElement(id)));
  elements.get('manual-review-title').value = 'Fresh Manual Headline';
  elements.get('manual-review-selected-image').innerHTML = '<div>Selected image</div>';
  elements.get('news-brief-image-picker').style.display = 'none';
  elements.get('news-brief-image-crop').style.display = 'block';
  elements.get('news-image-search-query').value = 'old custom query';
  elements.get('news-image-unsplash-results').innerHTML = '<button>Old result</button>';
  elements.get('news-image-zoom').value = '2.4';
  elements.get('news-image-final-preview').src = 'blob:old-preview';
  const body = {
    style: { overflow: 'auto' },
    appendChild(node) { node.parentElement = body; body.appended = node; },
  };
  const context = {
    document: {
      body,
      getElementById: (id) => elements.get(id) || null,
      addEventListener() {},
      removeEventListener() {},
    },
    window: { localStorage: { getItem: () => null } },
    URL: {
      revoked: [],
      revokeObjectURL(url) { this.revoked.push(url); },
    },
    newsBriefImageState: {
      open: false,
      fromTracker: false,
      mode: 'tracker',
      formSource: '',
      modalSessionId: 0,
      forceCloseBlocked: false,
      tab: 'unsplash',
      articleContext: null,
      firebaseDocId: '',
      webflowItemId: '',
      suggestedQuery: '',
      query: 'old custom query',
      searchInFlight: true,
      uploadInFlight: true,
      selectedSource: 'unsplash',
      selectedImage: { id: 'old-photo' },
      unsplashResults: [{ id: 'old-photo' }],
      sourceImage: { naturalWidth: 1200, naturalHeight: 800 },
      crop: { zoom: 2.4, x: 20, y: 30, dragging: true, dragX: 1, dragY: 1 },
      outputBlob: { size: 90000 },
      outputUrl: 'blob:old-output',
      outputSize: 90000,
      filename: 'old.jpg',
      requestId: 'old-request',
    },
    newsBriefPreSubmitImageState: {
      selected: true,
      source: 'unsplash',
      previewUrl: 'blob:confirmed-preview',
      blob: { size: 91000 },
      outputSize: 91000,
    },
    isNewsBriefImageToolsEnabled: () => true,
    isNewsBriefPostSubmitImagePromptEnabled: () => false,
    deriveNewsBriefImageKeywords: () => 'fresh headline keywords',
    offerNewsBriefSocialWorkflow: () => { throw new Error('should not offer socials'); },
    preventNewsBriefImageEscape: () => {},
    searchNewsBriefUnsplash: () => { context.searchCalls = (context.searchCalls || 0) + 1; },
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('newsBriefImageStatus'),
    functionBlock('setNewsBriefImageTab'),
    functionBlock('newsBriefImageFormHeadline'),
    functionBlock('resetManualNewsBriefImageModalSession'),
    functionBlock('ensureNewsBriefImageModalLayer'),
    functionBlock('openPreSubmitNewsBriefImageSelection'),
    functionBlock('openNewsBriefImageSelection'),
    functionBlock('closeNewsBriefImageSelection'),
  ].join('\n'), context);

  context.openPreSubmitNewsBriefImageSelection('manual');
  assert.equal(elements.get('news-brief-image-picker').style.display, 'block');
  assert.equal(elements.get('news-brief-image-crop').style.display, 'none');
  assert.equal(context.newsBriefImageState.sourceImage, null);
  assert.equal(context.newsBriefImageState.selectedImage, null);
  assert.equal(context.newsBriefImageState.unsplashResults.length, 0);
  assert.equal(context.newsBriefImageState.crop.zoom, 1);
  assert.equal(context.newsBriefImageState.outputBlob, null);
  assert.equal(context.newsBriefImageState.outputUrl, '');
  assert.equal(elements.get('news-image-search-query').value, 'fresh headline keywords');
  assert.equal(elements.get('news-image-unsplash-results').innerHTML, '');
  assert.equal(elements.get('news-image-final-preview').src, '');
  assert.equal(elements.get('news-image-crop-canvas').canvasCleared, true);
  assert.equal(context.newsBriefPreSubmitImageState.selected, true);
  assert.match(elements.get('manual-review-selected-image').innerHTML, /Selected image/);

  context.closeNewsBriefImageSelection();
  assert.equal(context.newsBriefPreSubmitImageState.selected, true);
  assert.match(elements.get('manual-review-selected-image').innerHTML, /Selected image/);
  context.newsBriefImageState.selectedImage = { id: 'stale-again' };
  context.newsBriefImageState.sourceImage = { naturalWidth: 1200, naturalHeight: 800 };
  elements.get('news-brief-image-crop').style.display = 'block';
  context.openPreSubmitNewsBriefImageSelection('manual');
  assert.equal(elements.get('news-brief-image-picker').style.display, 'block');
  assert.equal(elements.get('news-brief-image-crop').style.display, 'none');
  assert.equal(context.newsBriefImageState.selectedImage, null);
  assert.equal(context.newsBriefImageState.sourceImage, null);
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
  assert.doesNotMatch(functionBlock('openEditorialTrackerNewsBriefImage'), /formSource:'manual'|resetManualNewsBriefImageModalSession/);
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
