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
    this.style = {};
    this.children = [];
    this.textContent = '';
    this.href = '';
    this.download = '';
    this.rel = '';
    this.clicked = false;
    this.focused = false;
  }
  appendChild(child) { this.children.push(child); return child; }
  remove() { this.removed = true; }
  click() { this.clicked = true; }
  focus() { this.focused = true; }
}

test('Download image fetches Blob without navigating or warning', async () => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }
  const anchors = [];
  let fetchedUrl = '';
  let revokedUrl = '';
  class URLShim extends URL {}
  URLShim.createObjectURL = () => 'blob:download-url';
  URLShim.revokeObjectURL = (url) => { revokedUrl = url; };
  const context = {
    document: {
      getElementById: element,
      createElement: () => { const a = new Element(); anchors.push(a); return a; },
      body: { appendChild: (child) => child },
    },
    newsBriefSocialState: { creativeImageUrl: 'https://cdn.webflow.com/news-image.jpg', imageUrl: '' },
    isPersistentImageUrl: (url) => /^https?:\/\//.test(url),
    fetch: async (url) => {
      fetchedUrl = url;
      return { ok: true, blob: async () => new Blob(['image'], { type: 'image/jpeg' }) };
    },
    URL: URLShim,
    setTimeout: (fn) => fn(),
    console: { warn() {} },
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('newsBriefSocialImageDownloadFilename'),
    functionBlock('downloadNewsBriefSocialImage'),
  ].join('\n'), context);
  const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  const result = await context.downloadNewsBriefSocialImage(event);
  assert.equal(result, true);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(fetchedUrl, 'https://cdn.webflow.com/news-image.jpg');
  assert.equal(anchors[0].href, 'blob:download-url');
  assert.equal(anchors[0].download, 'news-image.jpg');
  assert.equal(anchors[0].clicked, true);
  assert.equal(revokedUrl, 'blob:download-url');
  assert.equal(elements.get('news-social-image-transfer-status').textContent, 'Image download started.');
});

test('Download image failure reports safely without clearing social state', async () => {
  const status = new Element();
  const state = { creativeImageUrl: 'https://cdn.webflow.com/news-image.jpg', imageUrl: '', stage: 'canva', dirty: true };
  const context = {
    document: { getElementById: () => status, createElement: () => new Element(), body: { appendChild() {} } },
    newsBriefSocialState: state,
    isPersistentImageUrl: () => true,
    fetch: async () => ({ ok: false }),
    console: { warn() {} },
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('newsBriefSocialImageDownloadFilename'),
    functionBlock('downloadNewsBriefSocialImage'),
  ].join('\n'), context);
  const result = await context.downloadNewsBriefSocialImage({ preventDefault() {}, stopPropagation() {} });
  assert.equal(result, false);
  assert.equal(status.textContent, 'Could not download image. Copy the image URL and try again.');
  assert.equal(context.newsBriefSocialState, state);
  assert.equal(state.stage, 'canva');
  assert.equal(state.dirty, true);
});

test('Canva instructions modal gates every template open and preserves state', () => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }
  const opened = [];
  const returnFocus = new Element();
  const state = { templateKey: 'template_1', dirty: true };
  const context = {
    document: { getElementById: element },
    window: { open: (...args) => opened.push(args) },
    canvaInstructionsState: { url: '', returnFocus: null },
    newsBriefSocialState: state,
    editorialCalendarSafeHttpUrl: (url) => /^https?:\/\//.test(String(url || '')) ? String(url).trim() : '',
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('openCanvaInstructionsModal'),
    functionBlock('closeCanvaInstructionsModal'),
    functionBlock('confirmCanvaInstructionsOpen'),
    functionBlock('handleCanvaInstructionsBackdrop'),
  ].join('\n'), context);

  assert.equal(context.openCanvaInstructionsModal('https://canva.link/template', returnFocus), true);
  assert.equal(elements.get('canva-instructions-modal').style.display, 'flex');
  assert.equal(opened.length, 0);
  context.closeCanvaInstructionsModal();
  assert.equal(opened.length, 0);
  assert.equal(returnFocus.focused, true);

  context.openCanvaInstructionsModal('https://canva.link/template', returnFocus);
  context.confirmCanvaInstructionsOpen();
  assert.deepEqual(opened[0], ['https://canva.link/template', '_blank', 'noopener,noreferrer']);
  assert.equal(context.newsBriefSocialState, state);

  context.openCanvaInstructionsModal('https://canva.link/template', returnFocus);
  context.handleCanvaInstructionsBackdrop({ target: elements.get('canva-instructions-modal'), currentTarget: elements.get('canva-instructions-modal') });
  assert.equal(elements.get('canva-instructions-modal').style.display, 'none');
});

test('Template-open controls route through instructions instead of direct anchors', () => {
  assert.match(html, /id="canva-instructions-modal"/);
  assert.match(functionBlock('testAdminCanvaLink'), /openCanvaInstructionsModal/);
  assert.match(functionBlock('openSelectedNewsBriefSocialCanvaTemplate'), /openCanvaInstructionsModal/);
  assert.match(functionBlock('bindNewsBriefCanvaTemplateOpenButtons'), /openCanvaInstructionsModal/);
  assert.doesNotMatch(functionBlock('renderNewsBriefSocialTemplates'), /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(functionBlock('renderNewsBriefSelectedTemplateSummary'), /target="_blank" rel="noopener noreferrer"/);
});
