import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
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

test('dashboard version badge is 15.9 for submit without creative workflow', () => {
  assert.match(html, />15\.9<\/div>/);
  assert.doesNotMatch(html, />15\.8<\/div>/);
  assert.doesNotMatch(html, />15\.7<\/div>/);
  assert.doesNotMatch(html, />15\.6<\/div>/);
  assert.doesNotMatch(html, />15\.5<\/div>/);
  assert.doesNotMatch(html, />15\.4<\/div>/);
  assert.doesNotMatch(html, />15\.3<\/div>/);
  assert.doesNotMatch(html, />15\.2<\/div>/);
  assert.doesNotMatch(html, />15\.2\.0<\/div>/);
  assert.doesNotMatch(html, />15\.1\.2<\/div>/);
  assert.doesNotMatch(html, />15\.1\.1<\/div>/);
  assert.doesNotMatch(html, />15\.1<\/div>/);
  assert.doesNotMatch(html, />15<\/div>/);
});

test('Draft new stories card icons match the pre-15.1 dashboard values', () => {
  const expectedCards = [
    ['Draft from trending news', String.fromCodePoint(0x1f4f0)],
    ['Draft from a URL', String.fromCodePoint(0x1f517)],
    ['Write your own story', `${String.fromCodePoint(0x270d)}\uFE0F`],
  ];

  for (const [title, icon] of expectedCards) {
    const cardPattern = new RegExp(`<div class="lcard-icon">${icon}</div>\\s*<div class="lcard-title">${title}</div>`);
    assert.match(html, cardPattern);
  }
  assert.doesNotMatch(html, /<div class="lcard-icon">\?\?<\/div>/);
});

test('dashboard visible Unicode symbols are not replaced with literal question marks', () => {
  assert.doesNotMatch(html, /\?\?/);
  assert.match(html, /title="Notifications">🔔<span/);
  assert.match(html, /Open dashboard →/);
  assert.match(html, /← Back/);
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

test('News Brief generation prompts choose a distinct Wocult-relevant standfirst angle', () => {
  const generate = functionBlock('generateNewsBrief');
  const manual = functionBlock('generateManualNewsBriefFields');
  for (const block of [generate, manual]) {
    assert.match(block, /WOCULT AUDIENCE/);
    assert.match(block, /people navigating work in India, including employees, managers, jobseekers, independent professionals and business leaders/);
    assert.match(block, /careers, hiring, skills, pay, management, workplace culture, job security, policy or power at work/);
    assert.match(block, /STANDFIRST PURPOSE/);
    assert.match(block, /strongest distinct implication, tension, shift or consequence/);
    assert.match(block, /must not restate, expand or paraphrase the headline/);
    assert.match(block, /Use Wocult(?:\\+)?'?s audience context to select the angle/);
    assert.match(block, /Do not mechanically mention "working professionals", "Indian professionals" or "employees"/);
    assert.match(block, /do not explicitly explain that it is "what this means for working professionals"/);
    assert.match(block, /140 to 200 characters/);
    assert.match(block, /distinct angle not already expressed by the headline/);
    assert.match(block, /Do not use a generic explanation that the story matters to working professionals/i);
    assert.match(block, /Include the company, number or place only when needed to make the angle clear/i);
    assert.match(block, /Do not repeat these details merely because they appear in the headline/i);
    assert.match(block, /do not invent/i);
    assert.match(block, /Preserve the original casing of all proper nouns/);
    assert.match(block, /JPMorgan plans 1,000 India GCC hires despite AI-driven workforce cuts/);
    assert.match(block, /India's technology hiring is becoming more specialised/);
    assert.doesNotMatch(block, /Make the meaning useful to Indian working professionals/i);
    assert.doesNotMatch(block, /explain what it means for Indian working professionals/i);
    assert.doesNotMatch(block, /what this means for employees/i);
  }
});

test('News headline normalization preserves proper nouns and acronyms without destructive lowercasing', () => {
  const block = functionBlock('normalizeNewsHeadline');
  assert.doesNotMatch(block, /slice\(1\)\.toLowerCase\(\)/);
  assert.doesNotMatch(block, /toLowerCase\(\)/);
  const context = {};
  vm.createContext(context);
  vm.runInContext(functionBlock('normalizeNewsHeadline'), context);
  const headline = '  "JPMorgan plans 1,000 India GCC hires despite AI-driven workforce cuts"  ';
  assert.equal(context.normalizeNewsHeadline(headline), 'JPMorgan plans 1,000 India GCC hires despite AI-driven workforce cuts');
  const terms = ['JPMorgan', 'India', 'Indian', 'Dallas', 'Mumbai', 'Bengaluru', 'GCC', 'AI', 'H-1B', 'Salesforce', 'Amazon', 'Uber', 'Intel'];
  const normalized = context.normalizeNewsHeadline(terms.join('  '));
  for (const term of terms) assert.match(normalized, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('News Brief Webflow field data preserves headline casing and uses fresh ISO timestamp', () => {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(args.length ? args[0] : '2026-07-23T14:37:52.123Z');
    }
    static now() { return new RealDate('2026-07-23T14:37:52.123Z').getTime(); }
  }
  const context = {
    Date: FixedDate,
    cleanNewsBriefBody: (title, standfirst, body) => body,
    limitSeoDescription: (text) => String(text || '').trim(),
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('normalizeNewsHeadline'),
    functionBlock('toSentenceCaseHeadline'),
    functionBlock('toWebflowDateTime'),
    functionBlock('buildNewsBriefFieldData'),
  ].join('\n'), context);
  const fieldData = context.buildNewsBriefFieldData({
    title: 'JPMorgan plans 1,000 India GCC hires despite AI-driven workforce cuts',
    slug: 'jpmorgan-plans-india-gcc-hires',
    standfirst: 'AI is redirecting India tech hiring.',
    body: '<p>Body</p>',
    publishedDate: '2026-07-23',
  });
  assert.equal(fieldData.title, 'JPMorgan plans 1,000 India GCC hires despite AI-driven workforce cuts');
  assert.equal(fieldData.name, 'JPMorgan plans 1,000 India GCC hires despite AI-driven workforce cuts');
  assert.equal(fieldData['published-date'], '2026-07-23T14:37:52.123Z');
  assert.equal(fieldData.publishedDate, '2026-07-23T14:37:52.123Z');
  assert.notEqual(fieldData['published-date'], '2026-07-23');
  assert.notEqual(fieldData['published-date'], '2026-07-23T00:00:00Z');
  assert.match(functionBlock('buildNewsBriefFieldData'), /'published-date': publishedDate/);
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
      querySelector: () => null,
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
    functionBlock('newsBriefImageTargetConfig'),
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
  assert.match(functionBlock('newsBriefImageTargetConfig'), /width:1050/);
  assert.match(functionBlock('newsBriefImageTargetConfig'), /height:700/);
  assert.match(functionBlock('getNewsBriefCropDrawRect'), /newsBriefImageTargetConfig/);
  assert.match(functionBlock('canvasToJpegBlob'), /image\/jpeg/);
  assert.match(functionBlock('processNewsBriefImageOutput'), /target\.maxBytes/);
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

test('Canva social workflow defines the three frozen templates and staged UI', () => {
  assert.match(html, /NEWS_BRIEF_SOCIAL_CANVA_TEMPLATES/);
  assert.match(html, /key:'template_1'/);
  assert.match(html, /Full-bleed gradient/);
  assert.match(html, /DAHQCSJUww0/);
  assert.match(html, /previewImage:'assets\/canva-template-1\.png'/);
  assert.match(html, /https:\/\/canva\.link\/snx9l8cent4vnlz/);
  assert.match(html, /key:'template_2'/);
  assert.match(html, /Text-led editorial/);
  assert.match(html, /DAHQQ10w4aw/);
  assert.match(html, /previewImage:'assets\/canva-template-2\.png'/);
  assert.match(html, /key:'template_3'/);
  assert.match(html, /Three-point summary/);
  assert.match(html, /DAHQRDKQRrY/);
  assert.match(html, /previewImage:'assets\/canva-template-3\.png'/);
  assert.match(html, /https:\/\/canva\.link\/zftpd3ly8z8tn9k/);
  assert.match(html, /news-social-template-preview/);
  assert.match(html, /class="btn news-social-template-preview-open"/);
  assert.match(html, /function openCanvaInstructionsModal/);
  assert.match(html, /id="news-social-open-canva-link"[^>]*onclick="openSelectedNewsBriefSocialCanvaTemplate\(event\)"/);
  assert.match(html, /id="news-social-stage-linkedin"/);
  assert.match(html, /Continue to creative/);
  assert.match(html, /id="news-social-stage-template"/);
  assert.match(html, /id="news-social-stage-creative"/);
  assert.match(html, /id="news-social-stage-canva"/);
  assert.match(html, /Continue to Canva/);
  assert.match(html, /Text to paste into Canva/);
  assert.match(html, /Final LinkedIn post/);
  assert.match(html, /Create a copy before editing so the Wocult master template remains unchanged\. Paste the prepared text and News Brief image into the Canva copy\./);
  assert.match(html, /id="news-social-calendar-section" class="news-social-stage" hidden/);
});

test('Canva template preview images are local repository assets', () => {
  for (const file of ['assets/canva-template-1.png', 'assets/canva-template-2.png', 'assets/canva-template-3.png']) {
    const stat = statSync(new URL(`../../${file}`, import.meta.url));
    assert.ok(stat.size > 10_000, `${file} should contain a real preview image`);
    const bytes = readFileSync(new URL(`../../${file}`, import.meta.url));
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
    assert.equal(bytes[2], 0x4e);
    assert.equal(bytes[3], 0x47);
  }
  assert.doesNotMatch(html, /media\.canva\.com\/v2\/document-image/);
});

test('Canva creative generation uses deterministic Template 1 and 2 fields and AI only for Template 3 bullets', () => {
  const generateCreative = functionBlock('generateNewsBriefCreativeFields');
  assert.match(generateCreative, /!isNewsBriefSocialBulletTemplate\(template\)/);
  assert.match(generateCreative, /initialNewsBriefCreativeFieldsForTemplate\(template\)/);
  assert.match(generateCreative, /Required JSON shape: \{"bullets":\["\.\.\."\]\}/);
  assert.match(generateCreative, /generate exactly '\+bulletCount\+' concise bullets/);
  assert.match(generateCreative, /if \(!bulletFields\.length\)/);
  assert.match(generateCreative, /No bullet fields are configured/);
  assert.doesNotMatch(generateCreative, /\{"headline":"\.\.\.","subtext":"\.\.\."\}/);
  assert.match(generateCreative, /British English/);
  assert.match(generateCreative, /no invented figures, quotations, people or claims/);
  assert.match(generateCreative, /no hashtags/);
  assert.match(generateCreative, /no emojis/);
  assert.doesNotMatch(generateCreative, /newsBriefSocialState\.options\s*=/);
  assert.match(generateCreative, /bulletFields\.forEach\(function\(field\)/);
  const validate = functionBlock('validateNewsBriefCreativeFields');
  assert.match(validate, /bullets\.length < bulletFields\.length/);
  const initial = functionBlock('initialNewsBriefCreativeFieldsForTemplate');
  assert.match(initial, /headline:headline, subtext:standfirst/);
  assert.match(initial, /values = \{ headline: headline \}/);
  assert.match(functionBlock('renderNewsBriefCreativeFields'), /over soft limit/);
  assert.match(html, /id="news-social-regenerate-creative-btn"[^>]*>Regenerate bullets/);
});

test('Canva workflow reuses the News Brief image while article crop remains 1050 by 700', () => {
  const config = functionBlock('newsBriefImageTargetConfig');
  assert.doesNotMatch(config, /width:1080/);
  assert.doesNotMatch(config, /height:1350/);
  assert.doesNotMatch(config, /500 \* 1024/);
  assert.match(config, /width:1050/);
  assert.match(config, /height:700/);
  assert.match(config, /maxBytes:100 \* 1024/);
  assert.doesNotMatch(functionBlock('uploadNewsBriefImageToWorker'), /form\.append\('purpose'/);
  assert.doesNotMatch(functionBlock('useSelectedNewsBriefImage'), /newsBriefImageState\.mode === 'social'/);
  assert.match(functionBlock('newsBriefSocialImageFromArticle'), /articleContext\.imageUrl/);
  assert.match(functionBlock('newsBriefSocialImageFromArticle'), /articleContext\.newsImage/);
  assert.match(functionBlock('isPersistentImageUrl'), /\^https\?:\\\/\\\//);
  assert.match(functionBlock('isPersistentImageUrl'), /\^\(blob\|data\|file\):/);
  assert.match(html, /No News Brief image was selected\. You can continue to Canva without an image\./);
});

test('Canva handoff and calendar save reuse News Brief image and persist template metadata', () => {
  const save = functionBlock('saveNewsBriefSocialToCalendar');
  assert.match(save, /Please select a Canva template before saving/);
  assert.match(save, /Please complete all Canva creative fields before saving/);
  assert.doesNotMatch(save, /Please upload a social image before saving/);
  assert.match(save, /Please confirm Canva editing is complete before saving/);
  assert.match(save, /persistentNewsBriefSocialImageUrl\(\)/);
  assert.doesNotMatch(save, /socialImageAssetId/);
  assert.doesNotMatch(save, /socialImageUrl:/);
  assert.match(save, /platform:'LinkedIn'/);
  assert.match(save, /collectionRef\.add\(data\)/);
  assert.match(save, /var templateKey = template \? template\.key/);
  assert.match(save, /if \(templateKey\) data\.socialTemplateKey = templateKey/);
  assert.match(save, /if \(templateKey\) data\.canvaTemplateId = templateKey/);
  assert.match(save, /if \(templateName\) data\.canvaTemplateName = templateName/);
  assert.match(save, /if \(templateDesignId\) data\.canvaTemplateDesignId = templateDesignId/);
  assert.match(save, /if \(templateUrl\) data\.canvaTemplateUrl = templateUrl/);
  assert.match(save, /if \(canvaDesignUrl\) data\.canvaDesignUrl = canvaDesignUrl/);
  assert.doesNotMatch(save, /canvaCreativeImageUrl|finishedCreativeImageUrl|socialCreativeImageUrl/);
  assert.match(save, /data\.creativeHeadline = newsBriefSocialState\.creativeFields\.headline/);
  assert.match(save, /if \(!withoutCreative && template\.key === 'template_3'\) data\.creativeBullets/);
  assert.match(save, /contentCopy:contentHtml/);
  assert.match(functionBlock('newsBriefSocialSetCanvaConfirmed'), /newsBriefSocialState\.stage = 'calendar'/);
  assert.match(functionBlock('newsBriefSocialSetCanvaConfirmed'), /newsBriefSocialState\.stage === 'calendar'\) newsBriefSocialState\.stage = 'canva'/);
  assert.match(functionBlock('renderNewsBriefSocialStages'), /news-social-calendar-actions/);
  assert.match(functionBlock('renderNewsBriefSocialFinalReview'), /Final LinkedIn post/);
  assert.match(functionBlock('renderNewsBriefSocialFinalReview'), /Canva creative link/);
  assert.doesNotMatch(functionBlock('renderNewsBriefSocialFinalReview'), /newsBriefSocialArticleUrl\(\)/);
});

test('Social workflow reset clears Canva template state without changing article image data or feature flags', () => {
  const reset = functionBlock('resetNewsBriefSocialState');
  for (const field of ['stage', 'templateKey', 'templateName', 'templateDesignId', 'templateUrl', 'creativeGenerating', 'creativeFields', 'creativeImageUrl', 'canvaDesignUrl', 'canvaConfirmed']) {
    assert.match(reset, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(reset, /socialImageAssetId|socialImageBlobUrl|socialImageEdited/);
  assert.match(html, /var NEWS_BRIEF_POST_SUBMIT_IMAGE_PROMPT_ENABLED = false/);
  assert.match(html, /var NEWS_BRIEF_IMAGE_TOOLS_ENABLED = true/);
});

test('LinkedIn options are cleaned of source labels and raw URLs', () => {
  const prompt = functionBlock('generateNewsBriefSocialOptions');
  assert.match(prompt, /do not include Source:, Link:, citation lines, raw URLs or source attribution lines/);
  assert.match(prompt, /Background source URL, not for inclusion in the post/);
  const clean = functionBlock('cleanNewsBriefSocialCopy');
  assert.match(clean, /https\?:\\\/\\\/\\S\+/);
  assert.match(clean, /\(source\|link\|citation\|read the full story\)/);
  const validate = functionBlock('validateNewsBriefSocialOptions');
  assert.match(validate, /cleanNewsBriefSocialCopy\(opt\.text\)/);
});

test('Template selection visibly selects cards and Stage 3 shows the selected template', () => {
  const renderTemplates = functionBlock('renderNewsBriefSocialTemplates');
  assert.match(renderTemplates, /aria-selected/);
  assert.match(renderTemplates, /Selected/);
  assert.match(renderTemplates, /news-social-template-continue-btn/);
  assert.match(renderTemplates, /newsBriefSocialState\.templateKey && !templates\.some/);
  const select = functionBlock('selectNewsBriefSocialTemplate');
  assert.match(select, /newsBriefSocialState\.templateKey = template\.key/);
  assert.match(select, /template\.enabled === false/);
  assert.doesNotMatch(select, /generateNewsBriefSocialOptions/);
  const continueFields = functionBlock('newsBriefSocialContinueToCreativeFields');
  assert.match(continueFields, /selectedTemplate\.enabled === false/);
  assert.match(continueFields, /generateNewsBriefCreativeFields\(false\)/);
  assert.match(functionBlock('renderNewsBriefSelectedTemplateSummary'), /Change template/);
});

test('Cancelling image modal preserves social options and edited LinkedIn copy', () => {
  const close = functionBlock('closeNewsBriefImageSelection');
  assert.doesNotMatch(close, /generateNewsBriefSocialOptions/);
  assert.doesNotMatch(close, /resetNewsBriefSocialState/);
  const start = functionBlock('startNewsBriefSocialWorkflow');
  assert.match(start, /if \(!newsBriefSocialState\.options\.length\) generateNewsBriefSocialOptions\(\)/);
});

test('frontend article image upload uses original request shape and stores permanent Webflow URL', async () => {
  const calls = [];
  const context = {
    WORKER: 'https://worker.test',
    currentUser: { getIdToken: async () => 'firebase-token' },
    Headers,
    Response,
    FormData,
    Blob,
    File,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ webflowImageUrl: 'https://cdn.webflow.com/news-image.jpg', webflowAssetId: 'asset-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    newsBriefImageState: { selectedSource: 'uploaded', selectedImage: { file: { name: 'image.jpg', size: 4, lastModified: 1 } } },
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('plainHeaders'),
    functionBlock('getCurrentUserIdToken'),
    functionBlock('workerFetchWithFirebaseAuthRaw'),
    functionBlock('parseWorkerResponse'),
    functionBlock('buildNewsBriefImageFilename'),
    functionBlock('newsBriefImageSourceKey'),
    functionBlock('selectedNewsBriefImageMetadata'),
    functionBlock('uploadNewsBriefImageToWorker'),
    functionBlock('updateNewsBriefSocialContextWithImage'),
  ].join('\n'), context);
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  const result = await context.uploadNewsBriefImageToWorker(
    { articleId: 'article-1', webflowItemId: 'wf-news-1', title: 'Headline' },
    blob,
    { source: 'uploaded', sourceKey: 'upload-1', filename: 'wocult-headline-a7k3.jpg', requestId: 'article-1:upload-1:wocult-headline-a7k3.jpg', unsplashMetadata: {} }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://worker.test/news-briefs/image');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer firebase-token');
  const form = calls[0].options.body;
  assert.equal(form.get('firebaseDocId'), 'article-1');
  assert.equal(form.get('webflowItemId'), 'wf-news-1');
  assert.equal(form.get('filename'), 'wocult-headline-a7k3.jpg');
  assert.equal(form.get('imageRequestId'), 'article-1:upload-1:wocult-headline-a7k3.jpg');
  assert.equal(form.get('purpose'), null);
  assert.equal(form.get('file').type, 'image/jpeg');
  const updated = context.updateNewsBriefSocialContextWithImage({ articleId: 'article-1', firebaseData: {} }, result);
  assert.equal(updated.webflowImageUrl, 'https://cdn.webflow.com/news-image.jpg');
  assert.equal(updated.firebaseData.webflowImageUrl, 'https://cdn.webflow.com/news-image.jpg');
  const uploadFlow = functionBlock('uploadPreSubmitNewsBriefImageIfNeeded');
  assert.match(uploadFlow, /return uploadNewsBriefImageToWorker\(socialContext, selected\.blob, selected\)\.then/);
  assert.match(uploadFlow, /clearNewsBriefPreSubmitImage\(\)/);
  assert.match(uploadFlow, /newsBriefTechnicalMessage\(err\)/);
});

test('calendar save creates one entry with final review data and excludes blob image URLs', async () => {
  const addCalls = [];
  const context = {
    console: { warn() {}, error() {} },
    alertMessage: '',
    alert(message) { this.alertMessage = message; },
    currentUser: { uid: 'user-1', email: 'editor@wocult.com', displayName: 'Editor' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } },
    editorialCalendarState: { entries: [], linkedSourceKeys: {} },
    guardStaffScreen: () => true,
    clearUnsavedChanges() {},
    document: {
      getElementById(id) {
        const values = {
          'news-social-calendar-title': { value: 'LinkedIn: Headline' },
          'news-social-owner': { value: 'Editor' },
          'news-social-publish-date': { value: '2026-07-25' },
          'news-social-publish-time': { value: '09:30' },
          'news-social-calendar-status': { value: 'Draft' },
          'news-social-image-url': { value: '' },
          'news-social-save-status': { textContent: '' },
          'news-social-save-btn': { disabled: false, textContent: 'Add to Editorial Calendar' },
          'news-social-complete': { style: { display: 'none' } },
        };
        return values[id] || null;
      },
    },
    db: {
      collection(name) {
        assert.equal(name, 'editorial_calendar');
        return {
          where() { return this; },
          limit() { return this; },
          async get() { return { forEach() {} }; },
          async add(data) {
            addCalls.push(data);
            return { id: 'calendar-new-1' };
          },
          doc(id) {
            return { id, set: async (data) => { addCalls.push(data); } };
          },
        };
      },
    },
    editorialCalendarLogActivity: async () => {},
    NEWS_BRIEF_SOCIAL_CANVA_TEMPLATES: [
      { key: 'template_1', name: 'Full-bleed gradient', designId: 'DAHQCSJUww0', url: 'https://canva.link/snx9l8cent4vnlz', fields: ['headline', 'subtext'] },
      { key: 'template_3', name: 'Three-point summary', designId: 'DAHQRDKQRrY', url: 'https://canva.link/zftpd3ly8z8tn9k', fields: ['headline', 'bullet1', 'bullet2', 'bullet3'] },
    ],
    newsBriefSocialState: {
      articleId: 'article-1',
      article: { title: 'News title', sourceUrl: 'https://reuters.com/story', submittedStoryUrl: 'https://wocult.com/news-title', firebaseData: {} },
      options: [{ label: 'Edited', text: 'Edited LinkedIn post without a URL' }],
      selectedIndex: 0,
      saving: false,
      calendarEntryId: '',
      templateKey: 'template_1',
      creativeFields: { headline: 'News title', subtext: 'Standfirst text' },
      canvaConfirmed: true,
      canvaDesignUrl: 'https://www.canva.com/design/copy',
      creativeImageUrl: 'blob:http://localhost/image',
      imageUrl: 'blob:http://localhost/image',
    },
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('escapeHtml'),
    functionBlock('newsBriefSocialTemplateByKey'),
    functionBlock('isPersistentImageUrl'),
    functionBlock('persistentNewsBriefSocialImageUrl'),
    functionBlock('newsBriefSocialArticleUrl'),
    functionBlock('selectedNewsBriefSocialCopy'),
    functionBlock('newsBriefSocialSummary'),
    functionBlock('newsBriefTechnicalMessage'),
    functionBlock('showNewsBriefSocialSaveComplete'),
    functionBlock('saveNewsBriefSocialToCalendar'),
  ].join('\n'), context);
  await Promise.all([context.saveNewsBriefSocialToCalendar(), context.saveNewsBriefSocialToCalendar()]);
  assert.equal(addCalls.length, 1);
  assert.equal(context.newsBriefSocialState.calendarEntryId, 'calendar-new-1');
  assert.equal(addCalls[0].contentCopy, 'Edited LinkedIn post without a URL');
  assert.equal(addCalls[0].socialTemplateKey, 'template_1');
  assert.equal(addCalls[0].creativeHeadline, 'News title');
  assert.equal(addCalls[0].creativeSubtext, 'Standfirst text');
  assert.equal(addCalls[0].canvaDesignUrl, 'https://www.canva.com/design/copy');
  assert.equal(Object.hasOwn(addCalls[0], 'canvaCreativeImageUrl'), false);
  assert.equal(addCalls[0].canvaTemplateId, 'template_1');
  assert.equal(addCalls[0].canvaTemplateName, 'Full-bleed gradient');
  assert.equal(Object.hasOwn(addCalls[0], 'imageUrl'), false);
  assert.equal(Object.hasOwn(addCalls[0], 'creativeBullets'), false);

  context.newsBriefSocialState = {
    articleId: 'article-2',
    article: { title: 'News title', sourceUrl: 'https://reuters.com/story', submittedStoryUrl: 'https://wocult.com/news-title', imageUrl: 'https://cdn.webflow.com/news.jpg', firebaseData: {} },
    options: [{ label: 'Edited', text: 'Second edited LinkedIn post' }],
    selectedIndex: 0,
    saving: false,
    calendarEntryId: '',
    templateKey: 'template_3',
    creativeFields: { headline: 'News title', bullet1: 'First fact', bullet2: 'Second fact', bullet3: 'Third fact' },
    canvaConfirmed: true,
    canvaDesignUrl: '',
    creativeImageUrl: 'https://cdn.webflow.com/news.jpg',
    imageUrl: 'https://cdn.webflow.com/news.jpg',
  };
  await context.saveNewsBriefSocialToCalendar();
  assert.equal(addCalls.length, 2);
  assert.equal(addCalls[1].socialTemplateKey, 'template_3');
  assert.equal(Object.hasOwn(addCalls[1], 'canvaCreativeImageUrl'), false);
  assert.deepEqual(Array.from(addCalls[1].creativeBullets), ['First fact', 'Second fact', 'Third fact']);
  assert.equal(Object.hasOwn(addCalls[1], 'creativeSubtext'), false);
  assert.equal(addCalls[1].imageUrl, 'https://cdn.webflow.com/news.jpg');
});

test('No duplicate static HTML ids are introduced by Canva social workflow', () => {
  const socialBlock = html.slice(html.indexOf('<div id="landing-news-brief-social"'), html.indexOf('<div id="landing-automated-news-briefs"'));
  const ids = [...socialBlock.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)].sort(), []);
});

test('Long-view Webflow submission uses authenticated Worker fetch and idempotency check', () => {
  const createDraft = functionBlock('createLongViewWebflowDraft');
  assert.match(createDraft, /existingWebflowMetadata\(docId\)/);
  assert.match(createDraft, /workerFetchWithFirebaseAuth\('\/webflow-posts'/);
  assert.match(createDraft, /collectionName: 'THA Posts'/);
  assert.match(createDraft, /collectionId: THA_POSTS_COLLECTION_ID/);
});
