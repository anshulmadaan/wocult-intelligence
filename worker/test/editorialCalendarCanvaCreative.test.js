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

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.style = {};
    this.attributes = {};
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.href = '';
    this.rel = '';
    this.disabled = false;
    this.focused = false;
  }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); this.childNodes = this.children; return child; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
}

function createHarness(overrides = {}) {
  const elements = new Map();
  function element(id, tagName = 'input') {
    if (!elements.has(id)) elements.set(id, new Element(tagName));
    return elements.get(id);
  }
  [
    'editorial-calendar-editor-title','ec-title','ec-content-type','ec-content-type-other','ec-content-type-other-wrap',
    'ec-summary','ec-summary-count','ec-owner','ec-publish-date','ec-publish-time','ec-status','ec-image-url','ec-image-preview',
    'ec-canva-template-name','ec-canva-design-url','ec-canva-open-link','ec-canva-missing-state','ec-canva-add-link-btn',
    'ec-content-copy','editorial-calendar-archive-btn','editorial-calendar-restore-btn','editorial-calendar-delete-btn',
    'editorial-calendar-editor-status'
  ].forEach((id) => element(id));
  element('ec-content-type').value = 'Social post';
  element('ec-status').value = 'Draft';
  const writes = [];
  const context = {
    document: {
      getElementById: element,
      querySelectorAll: () => [],
      createElement: (tagName) => new Element(tagName),
    },
    console: { warn() {}, error() {} },
    currentUser: { uid: 'user-1', email: 'editor@wocult.com', displayName: 'Editor' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } },
    editorialCalendarState: { editorEntryId: 'calendar-1', editorOriginal: {}, editorLoadedVersion: 1 },
    newsBriefSocialState: { options: [] },
    db: {
      collection(name) {
        assert.equal(name, 'editorial_calendar');
        return { doc: (id) => ({ id, get: async () => ({ exists: true, data: () => ({ updatedAt: { seconds: 0 } }) }), set: async (payload) => { writes.push(payload); } }) };
      },
    },
    guardStaffScreen: () => true,
    clearUnsavedChanges() {},
    editorialCalendarClearRecovery() {},
    editorialCalendarLogActivity: async () => {},
    editorialCalendarLoadActivity() {},
    editorialCalendarCheckRecovery() {},
    editorialCalendarActivityDetails: () => '',
    editorialCalendarUpdateOriginalPublishDate: async () => {},
    fbToast(message) { context.toast = message; },
    confirm: () => false,
    alert(message) { context.alertMessage = message; },
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    markUnsavedChanges() {},
    clearTimeout,
    setTimeout,
    EDITORIAL_CALENDAR_TYPES: ['Social post', 'News piece', 'Other'],
    EDITORIAL_CALENDAR_STATUSES: ['Draft', 'Working', 'Ready', 'Scheduled', 'Published', 'Cancelled'],
    escapeHtml: (value) => String(value || ''),
    stripHtml: (value) => String(value || '').replace(/<[^>]+>/g, ''),
    editorialCalendarSanitizeHtml: (value) => String(value || ''),
    offerNewsBriefSocialWorkflow(articleContext) {
      context.offeredArticle = articleContext;
      context.newsBriefSocialState = { articleId: articleContext.articleId, article: articleContext, options: [] };
    },
    startNewsBriefSocialWorkflow() { context.startedSocialWorkflow = true; },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('editorialCalendarDateKey'),
    functionBlock('editorialCalendarTimestampMillis'),
    functionBlock('editorialCalendarToggleOtherType'),
    functionBlock('editorialCalendarUpdateImagePreview'),
    functionBlock('editorialCalendarSafeHttpUrl'),
    functionBlock('editorialCalendarCanvaTemplateId'),
    functionBlock('editorialCalendarCanvaTemplateName'),
    functionBlock('editorialCalendarCanvaDesignUrl'),
    functionBlock('editorialCalendarPopulateCanvaCreative'),
    functionBlock('editorialCalendarUpdateCanvaCreativeLink'),
    functionBlock('editorialCalendarFocusCanvaLink'),
    functionBlock('editorialCalendarSocialContextFromEntry'),
    functionBlock('editorialCalendarCreateCanvaCreative'),
    functionBlock('editorialCalendarPopulateEditor'),
    functionBlock('editorialCalendarUpdateSummaryCount'),
    functionBlock('editorialCalendarCollectEditorData'),
    functionBlock('editorialCalendarSaveEntry'),
  ].join('\n'), context);
  return { context, elements, writes };
}

function validEntry() {
  return {
    id: 'calendar-1',
    title: 'LinkedIn: Story',
    contentType: 'Social post',
    channels: ['LinkedIn'],
    summary: 'Standfirst notes',
    contentCopy: '<p>LinkedIn post body</p>',
    owner: 'Editor',
    publishDate: '2026-07-28',
    publishTime: '09:30',
    status: 'Draft',
    imageUrl: 'https://cdn.webflow.com/article-image.jpg',
    canvaDesignUrl: ' https://example.com/public-design ',
    canvaTemplateId: 'template_1',
    canvaTemplateName: 'Full-bleed gradient',
    canvaTemplateUrl: 'https://canva.link/master-template',
    canvaCreativeImageUrl: 'https://historical.example.com/old-creative.jpg',
    recurrence: { frequency: 'Weekly' },
    occurrenceDate: '2026-07-28',
  };
}

test('Editorial Calendar public Canva link loads, edits and opens safely', () => {
  const { context, elements } = createHarness();
  context.editorialCalendarPopulateEditor(validEntry());
  assert.equal(elements.get('ec-canva-template-name').textContent, 'Full-bleed gradient');
  assert.equal(elements.get('ec-canva-design-url').value, 'https://example.com/public-design');
  assert.equal(elements.get('ec-canva-open-link').href, 'https://example.com/public-design');
  assert.equal(elements.get('ec-canva-open-link').rel, 'noopener noreferrer');
  assert.equal(elements.get('ec-canva-missing-state').style.display, 'none');
});

test('Missing Canva link shows empty state and Add Canva link focuses field', () => {
  const { context, elements } = createHarness();
  context.editorialCalendarPopulateEditor({ ...validEntry(), canvaDesignUrl: '' });
  assert.equal(elements.get('ec-canva-missing-state').style.display, 'block');
  assert.equal(elements.get('ec-canva-open-link').style.display, 'none');
  context.editorialCalendarFocusCanvaLink();
  assert.equal(elements.get('ec-canva-design-url').focused, true);
});

test('Calendar save allows missing Canva link and does not clear historical creative image data', async () => {
  const { context, elements, writes } = createHarness();
  context.editorialCalendarState.editorOriginal = validEntry();
  context.editorialCalendarPopulateEditor(validEntry());
  elements.get('ec-canva-design-url').value = '';
  context.editorialCalendarSaveEntry(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes[0].canvaDesignUrl, '');
  assert.equal(writes[0].canvaTemplateId, 'template_1');
  assert.equal(writes[0].canvaTemplateName, 'Full-bleed gradient');
  assert.equal(Object.hasOwn(writes[0], 'canvaCreativeImageUrl'), false);
  assert.equal(writes[0].imageUrl, 'https://cdn.webflow.com/article-image.jpg');
});

test('Create Canva creative reuses social workflow and retains originating calendar record', () => {
  const { context, elements } = createHarness();
  context.editorialCalendarState.editorOriginal = validEntry();
  context.editorialCalendarPopulateEditor(validEntry());
  elements.get('ec-canva-design-url').value = 'https://example.com/public-design';
  context.editorialCalendarCreateCanvaCreative();
  assert.equal(context.startedSocialWorkflow, true);
  assert.equal(context.newsBriefSocialState.calendarEntryId, 'calendar-1');
  assert.equal(context.newsBriefSocialState.stage, 'template');
  assert.equal(context.newsBriefSocialState.canvaDesignUrl, 'https://example.com/public-design');
  assert.equal(context.newsBriefSocialState.templateKey, 'template_1');
  assert.equal(context.newsBriefSocialState.calendarSourceEntry.id, 'calendar-1');
  assert.equal(context.newsBriefSocialState.calendarSourceEntry.occurrenceDate, '2026-07-28');
  assert.equal(context.offeredArticle.imageUrl, 'https://cdn.webflow.com/article-image.jpg');
});

test('Editorial Calendar Canva implementation removes finished creative preview workflow', () => {
  assert.doesNotMatch(html, /ec-canva-creative-image-url|ec-canva-creative-preview|ec-canva-open-image-link/);
  assert.doesNotMatch(html, /Finished creative image URL|Open creative image|No finished creative added/);
  assert.doesNotMatch(functionBlock('saveNewsBriefSocialToCalendar'), /canvaCreativeImageUrl|finishedCreativeImageUrl|socialCreativeImageUrl/);
  assert.doesNotMatch(functionBlock('editorialCalendarCollectEditorData'), /canvaCreativeImageUrl/);
  assert.match(functionBlock('editorialCalendarCreateCanvaCreative'), /offerNewsBriefSocialWorkflow/);
  assert.match(functionBlock('editorialCalendarCreateCanvaCreative'), /startNewsBriefSocialWorkflow/);
});
