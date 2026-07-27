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
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    this.childNodes = this.children;
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

function createHarness(overrides = {}) {
  const elements = new Map();
  function element(id, tagName = 'input') {
    if (!elements.has(id)) elements.set(id, new Element(tagName));
    return elements.get(id);
  }
  [
    'editorial-calendar-editor-title',
    'ec-title',
    'ec-content-type',
    'ec-content-type-other',
    'ec-content-type-other-wrap',
    'ec-summary',
    'ec-summary-count',
    'ec-owner',
    'ec-publish-date',
    'ec-publish-time',
    'ec-status',
    'ec-image-url',
    'ec-image-preview',
    'ec-canva-template-name',
    'ec-canva-design-url',
    'ec-canva-open-link',
    'ec-canva-creative-image-url',
    'ec-canva-open-image-link',
    'ec-canva-creative-preview',
    'ec-content-copy',
    'editorial-calendar-archive-btn',
    'editorial-calendar-restore-btn',
    'editorial-calendar-delete-btn',
    'editorial-calendar-editor-status',
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
    editorialCalendarState: {
      editorEntryId: 'calendar-1',
      editorOriginal: {},
      editorLoadedVersion: 1,
    },
    db: {
      collection(name) {
        assert.equal(name, 'editorial_calendar');
        return {
          doc(id) {
            return {
              id,
              get: async () => ({ exists: true, data: () => ({ updatedAt: { seconds: 0 } }) }),
              set: async (payload) => { writes.push(payload); },
            };
          },
        };
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
    fbToast() {},
    confirm: () => false,
    alert(message) { context.alertMessage = message; },
    alertMessage: '',
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    markUnsavedChanges() {},
    clearTimeout,
    setTimeout,
    EDITORIAL_CALENDAR_TYPES: ['Social post', 'News piece', 'Other'],
    EDITORIAL_CALENDAR_STATUSES: ['Draft', 'Working', 'Ready', 'Scheduled', 'Published', 'Cancelled'],
    escapeHtml: (value) => String(value || ''),
    editorialCalendarSanitizeHtml: (value) => String(value || ''),
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
    functionBlock('editorialCalendarCanvaCreativeImageUrl'),
    functionBlock('editorialCalendarPopulateCanvaCreative'),
    functionBlock('editorialCalendarUpdateCanvaCreativePreview'),
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
    summary: 'Notes',
    contentCopy: '<p>Post body</p>',
    owner: 'Editor',
    publishDate: '2026-07-28',
    publishTime: '09:30',
    status: 'Draft',
    imageUrl: 'https://cdn.webflow.com/article-image.jpg',
    canvaDesignUrl: ' https://example.com/design ',
    canvaCreativeImageUrl: 'https://cdn.webflow.com/finished-creative.jpg',
    canvaTemplateId: 'template_1',
    canvaTemplateName: 'Full-bleed gradient',
    canvaTemplateUrl: 'https://cdn.webflow.com/template-preview.jpg',
  };
}

test('Editorial Calendar editor loads Canva creative fields and safe preview links', () => {
  const { context, elements } = createHarness();
  context.editorialCalendarPopulateEditor(validEntry());

  assert.equal(elements.get('ec-canva-template-name').textContent, 'Full-bleed gradient');
  assert.equal(elements.get('ec-canva-design-url').value, 'https://example.com/design');
  assert.equal(elements.get('ec-canva-creative-image-url').value, 'https://cdn.webflow.com/finished-creative.jpg');
  assert.equal(elements.get('ec-canva-open-link').href, 'https://example.com/design');
  assert.equal(elements.get('ec-canva-open-link').rel, 'noopener noreferrer');
  assert.equal(elements.get('ec-canva-open-image-link').href, 'https://cdn.webflow.com/finished-creative.jpg');
  assert.equal(elements.get('ec-canva-open-image-link').rel, 'noopener noreferrer');
  const previewImg = elements.get('ec-canva-creative-preview').children[0];
  assert.equal(previewImg.src, 'https://cdn.webflow.com/finished-creative.jpg');
});

test('Editorial Calendar Canva preview never falls back to article or template images', () => {
  const { context, elements } = createHarness();
  context.editorialCalendarPopulateEditor({
    ...validEntry(),
    canvaCreativeImageUrl: '',
    imageUrl: 'https://cdn.webflow.com/article-image.jpg',
    canvaTemplateUrl: 'https://cdn.webflow.com/template-preview.jpg',
  });
  const preview = elements.get('ec-canva-creative-preview');
  assert.equal(preview.textContent, 'No finished creative added');
  assert.equal(preview.children.length, 0);
});

test('Editorial Calendar Canva creative image preview handles invalid and failed image states safely', () => {
  const { context, elements } = createHarness();
  elements.get('ec-canva-creative-image-url').value = 'javascript:alert(1)';
  context.editorialCalendarUpdateCanvaCreativePreview();
  assert.equal(elements.get('ec-canva-creative-preview').textContent, 'Preview unavailable');
  assert.equal(elements.get('ec-canva-open-image-link').style.display, 'none');

  elements.get('ec-canva-creative-image-url').value = 'https://cdn.webflow.com/broken.jpg';
  context.editorialCalendarUpdateCanvaCreativePreview();
  const img = elements.get('ec-canva-creative-preview').children[0];
  img.onerror();
  assert.equal(elements.get('ec-canva-creative-preview').textContent, 'Preview unavailable');
  assert.equal(elements.get('ec-canva-creative-image-url').value, 'https://cdn.webflow.com/broken.jpg');
});

test('Editorial Calendar save updates canonical Canva fields and preserves article image', async () => {
  const { context, elements, writes } = createHarness();
  context.editorialCalendarState.editorOriginal = validEntry();
  context.editorialCalendarPopulateEditor(validEntry());
  elements.get('ec-title').value = 'LinkedIn: Edited story';
  elements.get('ec-canva-design-url').value = 'https://example.com/edited-design';
  elements.get('ec-canva-creative-image-url').value = 'https://cdn.webflow.com/edited-creative.jpg';
  elements.get('ec-image-url').value = 'https://cdn.webflow.com/article-image.jpg';
  context.editorialCalendarSaveEntry(false);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(writes.length, 1);
  assert.equal(writes[0].title, 'LinkedIn: Edited story');
  assert.equal(writes[0].imageUrl, 'https://cdn.webflow.com/article-image.jpg');
  assert.equal(writes[0].canvaDesignUrl, 'https://example.com/edited-design');
  assert.equal(writes[0].canvaCreativeImageUrl, 'https://cdn.webflow.com/edited-creative.jpg');
  assert.equal(writes[0].canvaTemplateId, 'template_1');
  assert.equal(writes[0].canvaTemplateName, 'Full-bleed gradient');
});

test('Editorial Calendar Canva URL validation accepts HTTP(S) and rejects unsafe schemes', () => {
  const { context, elements } = createHarness();
  context.editorialCalendarPopulateEditor(validEntry());
  for (const value of ['blob:https://x', 'data:image/png;base64,abc', 'file:///tmp/a.png', 'javascript:alert(1)']) {
    elements.get('ec-canva-design-url').value = value;
    assert.throws(() => context.editorialCalendarCollectEditorData(true), /Canva creative link must start/);
    elements.get('ec-canva-design-url').value = 'https://example.com/design';
    elements.get('ec-canva-creative-image-url').value = value;
    assert.throws(() => context.editorialCalendarCollectEditorData(true), /Finished creative image URL must start/);
  }
  elements.get('ec-canva-design-url').value = 'http://example.com/design';
  elements.get('ec-canva-creative-image-url').value = 'https://cdn.webflow.com/creative.jpg';
  assert.doesNotThrow(() => context.editorialCalendarCollectEditorData(true));
});

test('Older calendar records without Canva fields still open and save with blank canonical fields', async () => {
  const { context, elements, writes } = createHarness();
  const oldRecord = {
    id: 'calendar-1',
    title: 'Old record',
    contentType: 'Social post',
    channels: ['LinkedIn'],
    summary: '',
    contentCopy: 'Body',
    owner: 'Editor',
    publishDate: '2026-07-28',
    publishTime: '',
    status: 'Draft',
    imageUrl: 'https://cdn.webflow.com/article-image.jpg',
  };
  context.editorialCalendarState.editorOriginal = oldRecord;
  context.editorialCalendarPopulateEditor(oldRecord);
  assert.equal(elements.get('ec-canva-template-name').textContent, 'None selected');
  assert.equal(elements.get('ec-canva-creative-preview').textContent, 'No finished creative added');
  context.editorialCalendarSaveEntry(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes[0].canvaDesignUrl, '');
  assert.equal(writes[0].canvaCreativeImageUrl, '');
  assert.equal(writes[0].imageUrl, 'https://cdn.webflow.com/article-image.jpg');
});

test('Editorial Calendar Canva implementation avoids unsafe rendering and duplicate static IDs', () => {
  assert.match(html, /<h3[^>]*>Canva creative<\/h3>/);
  assert.match(functionBlock('editorialCalendarUpdateCanvaCreativePreview'), /document\.createElement\('img'\)/);
  assert.doesNotMatch(functionBlock('editorialCalendarUpdateCanvaCreativePreview'), /innerHTML\s*=/);
  assert.doesNotMatch(functionBlock('editorialCalendarUpdateCanvaCreativePreview'), /ec-image-url|canvaTemplateUrl|templatePreview/);
  assert.match(functionBlock('editorialCalendarCollectEditorData'), /canvaCreativeImageUrl:canvaCreativeImageUrl/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const adminDupes = ids.filter((id, index) => id.startsWith('ec-canva-') && ids.indexOf(id) !== index);
  assert.deepEqual(adminDupes, []);
});
