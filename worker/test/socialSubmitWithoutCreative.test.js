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
  constructor() {
    this.value = '';
    this.textContent = '';
    this.style = {};
    this.disabled = false;
  }
}

function createHarness(overrides = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }
  [
    'news-social-status',
    'news-social-save-status',
    'news-social-submit-without-creative-btn',
    'news-social-continue-creative-btn',
    'news-social-calendar-title',
    'news-social-publish-date',
    'news-social-owner',
    'news-social-publish-time',
    'news-social-calendar-status',
    'news-social-image-url',
    'news-social-save-btn',
    'news-social-complete',
  ].forEach((id) => element(id));
  element('news-social-calendar-title').value = 'LinkedIn: Edited story';
  element('news-social-publish-date').value = '2026-07-28';
  element('news-social-calendar-status').value = 'Draft';
  const writes = [];
  const context = {
    document: { getElementById: element },
    console: { warn() {}, error() {} },
    currentUser: { uid: 'user-1', email: 'editor@wocult.com', displayName: 'Editor' },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } },
    editorialCalendarState: { entries: [], linkedSourceKeys: {} },
    NEWS_BRIEF_SOCIAL_CANVA_TEMPLATES: [
      { key: 'template_1', name: 'Template 1', designId: 'design-1', url: 'https://canva.example/master', fields: ['headline', 'subtext'] },
    ],
    newsBriefSocialState: {
      articleId: 'article-1',
      article: {
        title: 'Edited story',
        standfirst: 'Story standfirst',
        sourceUrl: 'https://source.example/story',
        submittedStoryUrl: 'https://wocult.example/story',
        imageUrl: 'https://cdn.example/story.jpg',
        firebaseData: {},
      },
      options: [{ label: 'Option 1', text: 'Edited selected LinkedIn copy' }],
      selectedIndex: 0,
      saving: false,
      calendarEntryId: '',
      stage: 'linkedin',
      templateKey: '',
      templateName: '',
      templateDesignId: '',
      templateUrl: '',
      creativeFields: {},
      canvaConfirmed: false,
      canvaDesignUrl: '',
      creativeImageUrl: '',
      imageUrl: '',
      calendarSourceEntry: null,
      dirty: true,
      completed: false,
    },
    db: {
      collection(name) {
        assert.equal(name, 'editorial_calendar');
        return {
          where() { return this; },
          limit() { return this; },
          async get() { return { forEach() {} }; },
          async add(data) {
            writes.push({ type: 'add', data });
            return { id: 'calendar-new-1' };
          },
          doc(id) {
            return {
              id,
              async set(data, optionsArg) {
                writes.push({ type: 'set', id, data, options: optionsArg });
              },
            };
          },
        };
      },
    },
    guardStaffScreen: () => true,
    clearUnsavedChanges() { context.unsavedCleared = true; },
    editorialCalendarLogActivity: async () => {},
    alert(message) { context.alertMessage = message; },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('escapeHtml'),
    functionBlock('newsBriefSocialTemplateByKey'),
    functionBlock('isPersistentImageUrl'),
    functionBlock('persistentNewsBriefSocialImageUrl'),
    functionBlock('newsBriefSocialArticleUrl'),
    functionBlock('selectedNewsBriefSocialCopy'),
    functionBlock('setNewsBriefStageOneActionsDisabled'),
    functionBlock('submitNewsBriefSocialWithoutCreative'),
    functionBlock('newsBriefSocialSummary'),
    functionBlock('newsBriefTechnicalMessage'),
    functionBlock('showNewsBriefSocialSaveComplete'),
    functionBlock('saveNewsBriefSocialToCalendar'),
  ].join('\n'), context);
  return { context, elements, writes };
}

test('Stage 1 exposes accessible submit without creative and continue actions', () => {
  assert.match(html, /id="news-social-submit-without-creative-btn"[^>]*type="button"[^>]*>Submit without creative<\/button>/);
  assert.match(html, /id="news-social-continue-creative-btn"[^>]*type="button"[^>]*>Continue to creative<\/button>/);
});

test('Submit without creative saves edited copy without template, Canva link or creative stage', async () => {
  const { context, elements, writes } = createHarness();
  let prevented = false;
  let stopped = false;
  await context.submitNewsBriefSocialWithoutCreative({
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].type, 'add');
  assert.equal(writes[0].data.contentCopy, 'Edited selected LinkedIn copy');
  assert.equal(Object.hasOwn(writes[0].data, 'canvaDesignUrl'), false);
  assert.equal(Object.hasOwn(writes[0].data, 'canvaTemplateId'), false);
  assert.equal(Object.hasOwn(writes[0].data, 'canvaCreativeImageUrl'), false);
  assert.equal(context.newsBriefSocialState.stage, 'linkedin');
  assert.equal(context.alertMessage, undefined);
  assert.equal(elements.get('news-social-status').textContent, 'LinkedIn post saved without creative');
  assert.equal(elements.get('news-social-complete').style.display, 'block');
});

test('Submit without creative prevents double submission and does not append Canva data to copy', async () => {
  const { context, writes } = createHarness({
    editorialCalendarLogActivity: async () => new Promise((resolve) => setTimeout(resolve, 5)),
  });
  await Promise.all([
    context.submitNewsBriefSocialWithoutCreative({ preventDefault() {}, stopPropagation() {} }),
    context.submitNewsBriefSocialWithoutCreative({ preventDefault() {}, stopPropagation() {} }),
  ]);
  assert.equal(writes.length, 1);
  assert.doesNotMatch(writes[0].data.contentCopy, /Canva|canva\.com|creative link/i);
});

test('Submit without creative updates same calendar document and preserves existing Canva metadata', async () => {
  const existingEntry = {
    id: 'calendar-1',
    originalCollection: 'articles',
    originalRecordId: 'article-1',
    originalRecordLink: 'https://wocult.example/story',
    contentType: 'Social post',
    channels: ['LinkedIn'],
    canvaDesignUrl: 'https://canva.example/public',
    canvaTemplateId: 'template_1',
    canvaTemplateName: 'Template 1',
    canvaTemplateUrl: 'https://canva.example/master',
    canvaCreativeImageUrl: 'https://historical.example/creative.jpg',
    recurrence: { frequency: 'Weekly' },
    occurrenceDate: '2026-07-28',
  };
  const { context, writes } = createHarness();
  context.editorialCalendarState.entries = [existingEntry];
  context.newsBriefSocialState.calendarEntryId = 'calendar-1';
  context.newsBriefSocialState.calendarSourceEntry = existingEntry;
  context.newsBriefSocialState.options[0].text = 'Updated LinkedIn copy';
  await context.submitNewsBriefSocialWithoutCreative({ preventDefault() {}, stopPropagation() {} });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].type, 'set');
  assert.equal(writes[0].id, 'calendar-1');
  assert.equal(writes[0].options.merge, true);
  assert.equal(writes[0].data.contentCopy, 'Updated LinkedIn copy');
  assert.equal(writes[0].data.canvaDesignUrl, 'https://canva.example/public');
  assert.equal(writes[0].data.canvaTemplateId, 'template_1');
  assert.equal(writes[0].data.canvaTemplateName, 'Template 1');
  assert.equal(Object.hasOwn(writes[0].data, 'canvaCreativeImageUrl'), false);
  assert.equal(context.newsBriefSocialState.calendarEntryId, 'calendar-1');
  assert.equal(context.editorialCalendarState.entries[0].occurrenceDate, '2026-07-28');
});

test('Submit without creative failure preserves text and workflow state', async () => {
  const { context, elements, writes } = createHarness({
    db: {
      collection() {
        return {
          where() { return this; },
          limit() { return this; },
          async get() { return { forEach() {} }; },
          async add() { throw new Error('Permission denied'); },
        };
      },
    },
  });
  await context.submitNewsBriefSocialWithoutCreative({ preventDefault() {}, stopPropagation() {} });
  assert.equal(writes.length, 0);
  assert.equal(context.newsBriefSocialState.options[0].text, 'Edited selected LinkedIn copy');
  assert.equal(context.newsBriefSocialState.stage, 'linkedin');
  assert.equal(context.newsBriefSocialState.completed, false);
  assert.equal(elements.get('news-social-submit-without-creative-btn').disabled, false);
  assert.match(elements.get('news-social-status').textContent, /could not be added/i);
});

test('Submit without creative rejects blank selected copy safely', () => {
  const { context, elements, writes } = createHarness();
  context.newsBriefSocialState.options[0].text = '   ';
  context.submitNewsBriefSocialWithoutCreative({ preventDefault() {}, stopPropagation() {} });
  assert.equal(writes.length, 0);
  assert.equal(elements.get('news-social-status').textContent, 'Write LinkedIn copy before saving.');
  assert.equal(context.newsBriefSocialState.stage, 'linkedin');
});
