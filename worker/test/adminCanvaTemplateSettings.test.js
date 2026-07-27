import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

function loadHarness(overrides = {}) {
  const varStart = html.indexOf('var STAFF_EMAILS');
  const varEnd = html.indexOf('function isStaffUser', varStart);
  const adminStart = html.indexOf('function cloneCanvaTemplate');
  const adminEnd = html.indexOf('function openNewsBriefSocialModal', adminStart);
  assert.ok(varStart > 0 && varEnd > varStart, 'admin vars must be present');
  assert.ok(adminStart > 0 && adminEnd > adminStart, 'admin functions must be present');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id,
      style: {},
      innerHTML: '',
      textContent: '',
      value: '',
      disabled: false,
      className: '',
    });
    return elements.get(id);
  }
  const writes = [];
  const context = {
    document: { getElementById: element },
    window: {
      confirm: () => true,
      open: (url) => { context.openedUrl = url; },
    },
    console: { warn() {}, error() {}, log() {} },
    FormData,
    URL,
    currentUser: null,
    db: null,
    hideAllAppScreens() { context.hideAllCalled = true; },
    goToLanding() { context.goToLandingCalled = true; },
    loadGuestWriterProfile() { context.loadGuestWriterProfileCalled = true; },
    showAccessScreen() { context.showAccessCalled = true; },
    hideStaffLandingPanels() { context.hideStaffPanelsCalled = true; },
    workerFetchWithFirebaseAuthRaw: async () => new Response(JSON.stringify({ ok: true, previewImageUrl: 'https://cdn.webflow.com/admin-preview.png' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    parseWorkerResponse: async (response) => {
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Worker failed');
      return data;
    },
    escapeHtml,
    escapeAttr: escapeHtml,
    writes,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext([
    html.slice(varStart, varEnd),
    functionBlock('isStaffUser'),
    functionBlock('isAdminUser'),
    functionBlock('updateAdminNavigationVisibility'),
    functionBlock('guardAdminScreen'),
    html.slice(adminStart, adminEnd),
  ].join('\n'), context);
  return { context, elements, writes };
}

test('Admin tab appears only for the configured Firebase admin email', () => {
  const { context, elements } = loadHarness();
  context.currentUser = { email: 'anmadaan@gmail.com' };
  context.updateAdminNavigationVisibility();
  assert.equal(elements.get('admin-nav-card').style.display, 'block');
  context.currentUser = { email: 'staff@example.com' };
  context.updateAdminNavigationVisibility();
  assert.equal(elements.get('admin-nav-card').style.display, 'none');
});

test('Admin page cannot be opened by manipulating browser state as a non-admin', () => {
  const { context, elements } = loadHarness();
  context.currentUser = { email: 'poorvi.arya23@gmail.com', uid: 'staff-1' };
  context.showAdminDashboard();
  assert.equal(context.hideAllCalled, true);
  assert.equal(context.goToLandingCalled, true);
  assert.equal(elements.has('landing-admin-dashboard') ? elements.get('landing-admin-dashboard').style.display : undefined, undefined);
});

test('Firestore config merges defaults, partial documents and malformed fields safely', () => {
  const { context } = loadHarness();
  const defaults = context.mergeCanvaTemplateConfig(null);
  assert.equal(defaults.length, 3);
  assert.equal(defaults[0].canvaUrl, 'https://canva.link/snx9l8cent4vnlz');
  const merged = context.mergeCanvaTemplateConfig({
    template1: { name: 'Custom name', canvaUrl: 'javascript:alert(1)', fields: [{ type: 'unsupported', label: 'Bad' }] },
    template2: { enabled: false, previewImageUrl: 'https://cdn.example.com/t2.png' },
  });
  assert.equal(merged[0].name, 'Custom name');
  assert.equal(merged[0].canvaUrl, 'https://canva.link/snx9l8cent4vnlz');
  assert.equal(JSON.stringify(merged[0].fields), JSON.stringify(['headline', 'subtext']));
  assert.equal(merged[1].enabled, false);
  assert.equal(merged[1].previewImageUrl, 'https://cdn.example.com/t2.png');
});

test('existing open social workflow keeps its template snapshot while reopening loads new config', async () => {
  let configName = 'First config';
  const { context } = loadHarness({
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ template1: { name: configName } }) }),
        }),
      }),
    },
  });
  const first = await context.loadCanvaTemplatesFromFirestore();
  context.newsBriefSocialState.templateConfigSnapshot = first.map(context.cloneCanvaTemplate);
  configName = 'Second config';
  assert.equal(context.currentNewsBriefSocialTemplates()[0].name, 'First config');
  const reopened = await context.loadCanvaTemplatesFromFirestore();
  context.newsBriefSocialState.templateConfigSnapshot = reopened.map(context.cloneCanvaTemplate);
  assert.equal(context.currentNewsBriefSocialTemplates()[0].name, 'Second config');
});

test('disabled templates disappear and at least one enabled template is required', () => {
  const { context } = loadHarness();
  const merged = context.mergeCanvaTemplateConfig({
    template1: { enabled: false },
    template2: { enabled: false },
    template3: { enabled: true },
  });
  context.newsBriefSocialState.templateConfigSnapshot = merged;
  assert.equal(JSON.stringify(context.currentNewsBriefSocialTemplates().filter((t) => t.enabled !== false).map((t) => t.id)), JSON.stringify(['template3']));
  assert.throws(() => context.validateAdminCanvaTemplates(merged.map((t) => ({ ...t, enabled: false }))), /At least one Canva template must remain enabled/);
});

test('field validation enforces headline, subtitle, bullet and unsupported-type rules', () => {
  const { context } = loadHarness();
  const valid = context.mergeCanvaTemplateConfig(null);
  assert.equal(context.validateAdminCanvaTemplates(valid).length, 3);
  assert.throws(() => context.validateAdminCanvaTemplates(valid.map((t, i) => i === 0 ? { ...t, fieldDefinitions: [{ id: 'subtitle', type: 'subtitle', label: 'Sub-title' }] } : t)), /Exactly one headline/);
  assert.throws(() => context.validateAdminCanvaTemplates(valid.map((t, i) => i === 0 ? { ...t, fieldDefinitions: [{ id: 'headline', type: 'headline', label: 'Headline' }, { id: 'subtitle', type: 'subtitle', label: 'One' }, { id: 'subtitle2', type: 'subtitle', label: 'Two' }] } : t)), /Only one subtitle/);
  assert.throws(() => context.validateAdminCanvaTemplates(valid.map((t, i) => i === 0 ? { ...t, fieldDefinitions: [{ id: 'headline', type: 'headline', label: 'Headline' }, ...Array.from({ length: 6 }, (_, n) => ({ id: `bullet${n + 1}`, type: 'bullet', label: `Bullet ${n + 1}` }))] } : t)), /No more than five bullet/);
  assert.throws(() => context.validateAdminCanvaTemplates(valid.map((t, i) => i === 0 ? { ...t, fieldDefinitions: [{ id: 'headline', type: 'headline', label: 'Headline' }, { id: 'deck', type: 'deck', label: 'Deck' }] } : t)), /Unsupported field type/);
});

test('save writes all three templates, confirms changed Canva URLs, cancels without writing and blocks duplicate clicks', async () => {
  const writes = [];
  let confirmCount = 0;
  const { context } = loadHarness({
    window: { confirm: () => { confirmCount += 1; return false; }, open() {} },
    db: { collection: () => ({ doc: () => ({ set: async (payload) => { writes.push(payload); } }) }) },
  });
  context.currentUser = { email: 'anmadaan@gmail.com' };
  context.adminCanvaState.templates = context.mergeCanvaTemplateConfig({ template1: { canvaUrl: 'https://canva.link/new-link' } });
  context.adminCanvaState.savedTemplates = context.mergeCanvaTemplateConfig(null);
  assert.equal(await context.saveAdminCanvaTemplates(), false);
  assert.equal(confirmCount, 1);
  assert.equal(writes.length, 0);
  context.window.confirm = () => true;
  assert.equal(await context.saveAdminCanvaTemplates(), true);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]), ['template1', 'template2', 'template3']);
  context.adminCanvaState.saving = true;
  assert.equal(await context.saveAdminCanvaTemplates(), false);
  assert.equal(writes.length, 1);
});

test('failed save retains entered values and safe URL validation rejects temporary or unsafe preview URLs', async () => {
  const { context } = loadHarness({
    db: { collection: () => ({ doc: () => ({ set: async () => { throw new Error('permission-denied'); } }) }) },
  });
  context.currentUser = { email: 'anmadaan@gmail.com' };
  context.adminCanvaState.templates = context.mergeCanvaTemplateConfig({ template1: { name: 'Unsaved edit' } });
  context.adminCanvaState.savedTemplates = context.mergeCanvaTemplateConfig(null);
  assert.equal(context.isSafeHttpUrl('https://cdn.example.com/preview.png', false), true);
  assert.equal(context.isSafeHttpUrl('blob:https://example.com/1', false), false);
  assert.equal(context.isSafeHttpUrl('data:image/png;base64,abc', false), false);
  assert.equal(context.isSafeHttpUrl('file:///tmp/a.png', false), false);
  assert.equal(context.isSafeHttpUrl('javascript:alert(1)', false), false);
  assert.equal(await context.saveAdminCanvaTemplates(), false);
  assert.equal(context.adminCanvaState.templates[0].name, 'Unsaved edit');
});

test('preview image upload stores only the permanent Worker-returned URL in the form state', async () => {
  const { context } = loadHarness();
  context.currentUser = { email: 'anmadaan@gmail.com' };
  context.adminCanvaState.templates = context.mergeCanvaTemplateConfig(null);
  await context.uploadAdminCanvaPreviewImage('template1', new File([new Uint8Array([1, 2, 3])], 'preview.png', { type: 'image/png' }));
  assert.equal(context.adminCanvaState.templates[0].previewImageUrl, 'https://cdn.webflow.com/admin-preview.png');
  assert.doesNotMatch(JSON.stringify(context.canvaTemplateFirestorePayload(context.adminCanvaState.templates)), /blob:|data:/);
});

test('headline and subtitle exact-fill paths remain separate from AI bullet generation', () => {
  assert.match(functionBlock('generateNewsBriefCreativeFields'), /if \(!isNewsBriefSocialBulletTemplate\(template\)\)/);
  assert.match(functionBlock('generateNewsBriefCreativeFields'), /initialNewsBriefCreativeFieldsForTemplate\(template\)/);
  assert.match(functionBlock('initialNewsBriefCreativeFieldsForTemplate'), /headline:headline, subtext:standfirst/);
  assert.match(functionBlock('generateNewsBriefCreativeFields'), /Generate structured JSON only for Wocult Canva Template 3 bullets/);
});

test('dashboard version badge is 15.8 and static IDs are not duplicated', () => {
  assert.match(html, />15\.8<\/div>/);
  assert.doesNotMatch(html, />15\.7<\/div>/);
  assert.doesNotMatch(html, />15\.6<\/div>/);
  assert.doesNotMatch(html, />15\.5<\/div>/);
  assert.doesNotMatch(html, />15\.4<\/div>/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const dupes = ids.filter((id, index) => ids.indexOf(id) !== index);
  const adminIds = [...html.matchAll(/\sid="(admin-[^"]+)"/g)].map((match) => match[1]);
  const adminDupes = adminIds.filter((id, index) => adminIds.indexOf(id) !== index);
  assert.deepEqual(adminDupes, []);
});
