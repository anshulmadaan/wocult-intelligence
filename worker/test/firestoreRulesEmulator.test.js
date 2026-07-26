import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-wocult-rules';
const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
let testEnv;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('# Firestore emulator not running; use npm run test:firestore-rules through firebase-tools emulators:exec.');
  process.exit(0);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function field(type, label = type, id = type) {
  return { id, type, label };
}

function template(overrides = {}) {
  return {
    name: 'Wocult Template',
    description: 'Template description',
    canvaUrl: 'https://www.canva.com/design/template/edit',
    previewImageUrl: 'assets/canva-template-1.png',
    enabled: true,
    fields: [
      field('headline', 'Headline', 'headline'),
      field('subtitle', 'Sub-title', 'subtitle'),
      field('bullet', 'Bullet 1', 'bullet1'),
    ],
    ...overrides,
  };
}

function validConfig(overrides = {}) {
  return {
    template1: template({ name: 'Wocult Template 1', previewImageUrl: 'assets/canva-template-1.png' }),
    template2: template({ name: 'Wocult Template 2', previewImageUrl: 'assets/canva-template-2.png' }),
    template3: template({ name: 'Wocult Template 3', previewImageUrl: 'assets/canva-template-3.png' }),
    ...overrides,
  };
}

function dashboardDefaultConfig() {
  return validConfig({
    template1: template({
      name: 'Wocult Template 1',
      previewImageUrl: 'assets/canva-template-1.png',
      fields: [
        field('headline', 'Headline', 'headline'),
        field('subtitle', 'Sub-title', 'subtitle'),
      ],
    }),
    template2: template({
      name: 'Wocult Template 2',
      previewImageUrl: 'assets/canva-template-2.png',
      fields: [
        field('headline', 'Headline', 'headline'),
        field('subtitle', 'Sub-title', 'subtitle'),
      ],
    }),
    template3: template({
      name: 'Wocult Template 3',
      previewImageUrl: 'assets/canva-template-3.png',
      fields: [
        field('headline', 'Headline', 'headline'),
        field('bullet', 'Bullet 1', 'bullet1'),
        field('bullet', 'Bullet 2', 'bullet2'),
        field('bullet', 'Bullet 3', 'bullet3'),
      ],
    }),
  });
}

function authed(email) {
  return testEnv.authenticatedContext(email.replace(/[^a-z0-9]/gi, '_'), { email }).firestore();
}

function anon() {
  return testEnv.unauthenticatedContext().firestore();
}

function canvaRef(db) {
  return doc(db, 'editorial_config/canva_templates');
}

function articleRef(db) {
  return doc(db, 'articles/test-document');
}

function otherEditorialRef(db) {
  return doc(db, 'editorial_config/a-different-document');
}

function automationRef(db) {
  return doc(db, 'news_brief_automation/candidate-1');
}

function automationRunRef(db) {
  return doc(db, 'news_brief_automation_runs/run-1');
}

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function assertAdminWriteDenied(payload) {
  await assertFails(setDoc(canvaRef(authed('anmadaan@gmail.com')), payload));
}

before(async () => {
  assert.equal(PROJECT_ID, 'demo-wocult-rules');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test('Canva reads require authentication and allow ordinary users and Admin', async () => {
  await seed('editorial_config/canva_templates', validConfig());
  await assertFails(getDoc(canvaRef(anon())));
  await assertSucceeds(getDoc(canvaRef(authed('ordinary@example.com'))));
  await assertSucceeds(getDoc(canvaRef(authed('anmadaan@gmail.com'))));
});

test('Canva writes are Admin-only and delete is denied for everyone', async () => {
  const payload = validConfig();
  await assertSucceeds(setDoc(canvaRef(authed('anmadaan@gmail.com')), payload));
  await assertSucceeds(updateDoc(canvaRef(authed('anmadaan@gmail.com')), {
    'template1.description': 'Updated description',
  }));
  for (const email of ['poorvi.arya23@gmail.com', 'divya.madaan@gmail.com', 'ordinary@example.com']) {
    await testEnv.clearFirestore();
    await assertFails(setDoc(canvaRef(authed(email)), payload));
    await seed('editorial_config/canva_templates', payload);
    await assertFails(updateDoc(canvaRef(authed(email)), {
      'template1.description': 'Denied update',
    }));
  }
  await testEnv.clearFirestore();
  await assertFails(setDoc(canvaRef(anon()), payload));
  await seed('editorial_config/canva_templates', payload);
  await assertFails(updateDoc(canvaRef(anon()), {
    'template1.description': 'Denied update',
  }));
  await assertFails(deleteDoc(canvaRef(authed('anmadaan@gmail.com'))));
  await assertFails(deleteDoc(canvaRef(authed('poorvi.arya23@gmail.com'))));
  await assertFails(deleteDoc(canvaRef(anon())));
});

test('Canva shape validation rejects missing or extra top-level template keys', async () => {
  const missing = validConfig();
  delete missing.template1;
  await assertAdminWriteDenied(missing);
  const missing2 = validConfig();
  delete missing2.template2;
  await assertAdminWriteDenied(missing2);
  const missing3 = validConfig();
  delete missing3.template3;
  await assertAdminWriteDenied(missing3);
  await assertAdminWriteDenied(validConfig({ template4: template() }));
  await assertAdminWriteDenied({ ...validConfig(), extraTopLevel: true });
});

test('Canva template and field property validation rejects unsupported shapes', async () => {
  const missingProperty = validConfig();
  delete missingProperty.template1.name;
  await assertAdminWriteDenied(missingProperty);

  const extraTemplateProperty = validConfig();
  extraTemplateProperty.template1.updatedAt = 'not allowed';
  await assertAdminWriteDenied(extraTemplateProperty);

  const extraFieldProperty = validConfig();
  extraFieldProperty.template1.fields[0].helpText = 'not allowed';
  await assertAdminWriteDenied(extraFieldProperty);

  const unsupportedFieldType = validConfig();
  unsupportedFieldType.template1.fields[0].type = 'deck';
  await assertAdminWriteDenied(unsupportedFieldType);
});

test('Canva field cardinality validation rejects invalid headline, subtitle, bullet and total counts', async () => {
  const zeroHeadline = validConfig();
  zeroHeadline.template1.fields = [field('subtitle', 'Sub-title', 'subtitle')];
  await assertAdminWriteDenied(zeroHeadline);

  const twoHeadlines = validConfig();
  twoHeadlines.template1.fields = [
    field('headline', 'Headline 1', 'headline'),
    field('headline', 'Headline 2', 'headline2'),
  ];
  await assertAdminWriteDenied(twoHeadlines);

  const twoSubtitles = validConfig();
  twoSubtitles.template1.fields = [
    field('headline', 'Headline', 'headline'),
    field('subtitle', 'Sub-title 1', 'subtitle'),
    field('subtitle', 'Sub-title 2', 'subtitle2'),
  ];
  await assertAdminWriteDenied(twoSubtitles);

  const sixBullets = validConfig();
  sixBullets.template1.fields = [
    field('headline', 'Headline', 'headline'),
    ...Array.from({ length: 6 }, (_, index) => field('bullet', `Bullet ${index + 1}`, `bullet${index + 1}`)),
  ];
  await assertAdminWriteDenied(sixBullets);

  const moreThanSeven = validConfig();
  moreThanSeven.template1.fields = [
    field('headline', 'Headline', 'headline'),
    field('subtitle', 'Sub-title', 'subtitle'),
    ...Array.from({ length: 6 }, (_, index) => field('bullet', `Bullet ${index + 1}`, `bullet${index + 1}`)),
  ];
  await assertAdminWriteDenied(moreThanSeven);

  const noFields = validConfig();
  noFields.template1.fields = [];
  await assertAdminWriteDenied(noFields);
});

test('Canva scalar validation rejects non-boolean enabled and non-string text fields', async () => {
  const badEnabled = validConfig();
  badEnabled.template1.enabled = 'true';
  await assertAdminWriteDenied(badEnabled);

  const badName = validConfig();
  badName.template1.name = 123;
  await assertAdminWriteDenied(badName);

  const badDescription = validConfig();
  badDescription.template1.description = 123;
  await assertAdminWriteDenied(badDescription);

  const badLabel = validConfig();
  badLabel.template1.fields[0].label = 123;
  await assertAdminWriteDenied(badLabel);
});

test('Canva URL validation accepts UI-normalized safe URLs and local preview fallbacks', async () => {
  await assertSucceeds(setDoc(canvaRef(authed('anmadaan@gmail.com')), dashboardDefaultConfig()));
  await testEnv.clearFirestore();

  await assertSucceeds(setDoc(canvaRef(authed('anmadaan@gmail.com')), validConfig({
    template1: template({
      canvaUrl: new URL('HTTPS://www.canva.com/design/template/edit').toString(),
      previewImageUrl: 'assets/canva-template-1.png',
    }),
    template2: template({
      canvaUrl: 'http://canva.link/template',
      previewImageUrl: 'assets/canva-template-2.png',
    }),
    template3: template({
      canvaUrl: 'https://example.com/not-canva-is-allowed',
      previewImageUrl: 'assets/canva-template-3.png',
    }),
  })));

  await testEnv.clearFirestore();
  await assertSucceeds(setDoc(canvaRef(authed('anmadaan@gmail.com')), validConfig({
    template1: template({ previewImageUrl: 'https://cdn.example.com/preview.png' }),
  })));
});

test('Canva URL validation rejects unsafe Canva and preview protocols', async () => {
  for (const protocol of ['javascript:', 'data:', 'blob:', 'file:']) {
    const badCanva = validConfig();
    badCanva.template1.canvaUrl = `${protocol}alert(1)`;
    await assertAdminWriteDenied(badCanva);

    const badPreview = validConfig();
    badPreview.template1.previewImageUrl = `${protocol}preview`;
    await assertAdminWriteDenied(badPreview);
  }
});

test('catch-all compatibility remains public except for the exact Canva document', async () => {
  await assertSucceeds(setDoc(articleRef(anon()), { title: 'Public compatibility' }));
  await assertSucceeds(getDoc(articleRef(anon())));

  await assertSucceeds(setDoc(otherEditorialRef(anon()), { value: 'Still public compatibility' }));
  await assertSucceeds(getDoc(otherEditorialRef(anon())));

  await seed('editorial_config/canva_templates', validConfig());
  await assertFails(getDoc(canvaRef(anon())));
  await assertFails(setDoc(canvaRef(anon()), validConfig()));
});

test('news_brief_automation and runs keep existing staff restrictions and write prohibitions', async () => {
  await seed('news_brief_automation/candidate-1', { status: 'needs_editorial_check' });
  await seed('news_brief_automation_runs/run-1', { state: 'complete' });

  await assertSucceeds(getDoc(automationRef(authed('poorvi.arya23@gmail.com'))));
  await assertSucceeds(updateDoc(automationRef(authed('divya.madaan@gmail.com')), { status: 'held' }));
  await assertFails(getDoc(automationRef(authed('ordinary@example.com'))));
  await assertFails(getDoc(automationRef(anon())));
  await assertFails(setDoc(doc(authed('anmadaan@gmail.com'), 'news_brief_automation/new-candidate'), { status: 'new' }));
  await assertFails(deleteDoc(automationRef(authed('anmadaan@gmail.com'))));

  await assertSucceeds(getDoc(automationRunRef(authed('anmadaan@gmail.com'))));
  await assertFails(getDoc(automationRunRef(authed('ordinary@example.com'))));
  await assertFails(setDoc(automationRunRef(authed('anmadaan@gmail.com')), { state: 'changed' }));
});
