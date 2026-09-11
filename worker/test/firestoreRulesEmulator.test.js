import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getBytes,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'demo-wocult-rules';
const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const STORAGE_RULES = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8');
let testEnv;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('# Firestore emulator not running; use firebase emulators:exec --only firestore,storage "npm run test:firestore-rules".');
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
    template4: template({ name: 'Wocult Template 4', previewImageUrl: '' }),
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
    template4: template({
      name: 'Wocult Template 4',
      previewImageUrl: '',
      canvaUrl: 'https://canva.link/z1j5ppsibdvb01l',
      fields: [
        field('headline', 'Headline', 'headline'),
        field('subtitle', 'Sub-title', 'subtitle'),
      ],
    }),
  });
}

function authed(email) {
  return testEnv.authenticatedContext(email.replace(/[^a-z0-9]/gi, '_'), { email }).firestore();
}

function authedVerified(email, uid = '') {
  return testEnv.authenticatedContext(uid || email.replace(/[^a-z0-9]/gi, '_'), {
    email,
    email_verified: true,
  });
}

function authedVerifiedDb(email, uid = '') {
  return authedVerified(email, uid).firestore();
}

function authedVerifiedStorage(email, uid = '') {
  return authedVerified(email, uid).storage();
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

function podcastRef(db, id = 'podcast-1') {
  return doc(db, `podcast_sessions/${id}`);
}

function podcastResponseRef(db, id = 'podcast-1', questionId = 'q1') {
  return doc(db, `podcast_sessions/${id}/responses/${questionId}`);
}

function podcastVersionRef(db, id = 'podcast-1', questionId = 'q1', versionId = 'v1') {
  return doc(db, `podcast_sessions/${id}/responses/${questionId}/versions/${versionId}`);
}

function podcastSession(overrides = {}) {
  return {
    sessionId: 'podcast-1',
    podcastTitle: 'Wocult episode',
    guestName: 'Guest',
    guestEmail: 'guest@example.com',
    normalizedGuestEmail: 'guest@example.com',
    guestUid: '',
    guestIntro: 'Intro',
    questions: [{ id: 'q1', order: 1, question: 'Question?', talkingPoints: '' }],
    questionCount: 1,
    completedQuestionCount: 0,
    status: 'sent',
    createdBy: 'anmadaan@gmail.com',
    createdAt: new Date(),
    updatedAt: new Date(),
    overallFeedback: '',
    ...overrides,
  };
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
    storage: { rules: STORAGE_RULES },
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
  const missing4 = validConfig();
  delete missing4.template4;
  await assertAdminWriteDenied(missing4);
  await assertAdminWriteDenied(validConfig({ template5: template() }));
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
    template4: template({
      canvaUrl: 'https://canva.link/z1j5ppsibdvb01l',
      previewImageUrl: '',
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

test('Podcast Prep sessions are staff-managed and isolated to the verified invited guest', async () => {
  const staff = authedVerifiedDb('anmadaan@gmail.com', 'staff-uid');
  const guest = authedVerifiedDb('guest@example.com', 'guest-uid');
  const otherGuest = authedVerifiedDb('other@example.com', 'other-uid');
  const unverifiedGuest = testEnv.authenticatedContext('guest-uid-unverified', {
    email: 'guest@example.com',
    email_verified: false,
  }).firestore();
  const session = podcastSession();

  await assertSucceeds(setDoc(podcastRef(staff), session));
  await assertSucceeds(getDoc(podcastRef(staff)));
  await assertSucceeds(getDoc(podcastRef(guest)));
  await assertFails(getDoc(podcastRef(otherGuest)));
  await assertFails(getDoc(podcastRef(unverifiedGuest)));

  await assertSucceeds(updateDoc(podcastRef(guest), {
    guestUid: 'guest-uid',
    status: 'opened',
    openedAt: new Date(),
    updatedAt: new Date(),
  }));
  await assertFails(updateDoc(podcastRef(otherGuest), {
    guestUid: 'other-uid',
    status: 'opened',
    openedAt: new Date(),
    updatedAt: new Date(),
  }));

  await assertSucceeds(setDoc(podcastResponseRef(guest), {
    questionId: 'q1',
    questionOrder: 1,
    questionText: 'Question?',
    hasSavedResponse: true,
    latestVersionId: 'v1',
    latestVersionNumber: 1,
    responseUpdatedAt: new Date(),
  }, { merge: true }));
  await assertSucceeds(setDoc(podcastVersionRef(guest), {
    versionNumber: 1,
    storagePath: 'podcast_recordings/podcast-1/guest-uid/q1/v1.webm',
    audioMimeType: 'audio/webm',
    duration: 12,
    transcript: '',
    transcriptionStatus: 'not_requested',
    transcriptionError: '',
    transcriptionSource: '',
    createdAt: new Date(),
    createdByUid: 'guest-uid',
  }));
  await assertFails(getDoc(podcastResponseRef(otherGuest)));
  await assertFails(setDoc(podcastVersionRef(otherGuest, 'podcast-1', 'q1', 'v2'), {
    versionNumber: 2,
    storagePath: 'podcast_recordings/podcast-1/other-uid/q1/v2.webm',
    audioMimeType: 'audio/webm',
    duration: 12,
    transcript: '',
    transcriptionStatus: 'not_requested',
    transcriptionError: '',
    transcriptionSource: '',
    createdAt: new Date(),
    createdByUid: 'other-uid',
  }));
});

test('Podcast Prep guest cannot list, mutate staff fields, delete, or overwrite versions', async () => {
  const staff = authedVerifiedDb('anmadaan@gmail.com', 'staff-uid');
  const guest = authedVerifiedDb('guest@example.com', 'guest-uid');
  await seed('podcast_sessions/podcast-1', podcastSession({ guestUid: 'guest-uid', status: 'in_progress' }));
  await seed('podcast_sessions/podcast-1/responses/q1', {
    questionId: 'q1',
    questionOrder: 1,
    questionText: 'Question?',
    hasSavedResponse: true,
    latestVersionId: 'v1',
    latestVersionNumber: 1,
    responseUpdatedAt: new Date(),
    feedback: 'Staff-only feedback',
    feedbackUpdatedAt: new Date(),
  });
  await seed('podcast_sessions/podcast-1/responses/q1/versions/v1', {
    versionNumber: 1,
    storagePath: 'podcast_recordings/podcast-1/guest-uid/q1/v1.webm',
    audioMimeType: 'audio/webm',
    duration: 12,
    transcript: '',
    transcriptionStatus: 'not_requested',
    transcriptionError: '',
    transcriptionSource: '',
    createdAt: new Date(),
    createdByUid: 'guest-uid',
  });

  await assertFails(getDocs(collection(guest, 'podcast_sessions')));
  await assertFails(updateDoc(podcastRef(guest), { guestEmail: 'attacker@example.com', updatedAt: new Date() }));
  await assertFails(updateDoc(podcastRef(guest), { normalizedGuestEmail: 'attacker@example.com', updatedAt: new Date() }));
  await assertFails(updateDoc(podcastRef(guest), { questions: [{ id: 'q1', order: 1, question: 'Question?', talkingPoints: 'Guest edit' }], updatedAt: new Date() }));
  await assertFails(updateDoc(podcastRef(guest), { guestUid: 'attacker-uid', updatedAt: new Date() }));
  await assertFails(updateDoc(podcastRef(guest), { status: 'feedback_shared', updatedAt: new Date() }));
  await assertFails(updateDoc(podcastRef(guest), { status: 'ready', readyAt: new Date(), updatedAt: new Date() }));
  await assertFails(deleteDoc(podcastRef(guest)));

  await assertFails(updateDoc(podcastResponseRef(guest), { feedback: 'Guest changed feedback' }));
  await assertFails(updateDoc(podcastResponseRef(guest), {
    questionText: 'Guest changed the saved question snapshot',
    responseUpdatedAt: new Date(),
  }));
  await assertFails(setDoc(podcastResponseRef(guest), {
    questionId: 'q1',
    questionOrder: 1,
    questionText: 'Question?',
    hasSavedResponse: true,
    latestVersionId: 'v2',
    latestVersionNumber: 2,
    responseUpdatedAt: new Date(),
    feedback: 'Guest inserted feedback',
  }, { merge: true }));
  await assertFails(updateDoc(podcastVersionRef(guest), { transcript: 'Guest fake transcript', transcriptionStatus: 'completed' }));
  await assertFails(deleteDoc(podcastVersionRef(guest)));

  await assertSucceeds(updateDoc(podcastResponseRef(staff), {
    feedback: 'Updated by staff',
    feedbackUpdatedAt: new Date(),
  }));
  await assertSucceeds(updateDoc(podcastVersionRef(staff), {
    transcript: 'Transcript by staff/backend',
    transcriptionStatus: 'completed',
    transcriptionSource: 'manual',
    transcriptUpdatedAt: new Date(),
    transcriptUpdatedBy: 'staff-uid',
  }));
  await assertSucceeds(updateDoc(podcastRef(staff), {
    questions: [{ id: 'q1', order: 1, question: 'Question?', talkingPoints: 'Staff talking points' }],
    updatedAt: new Date(),
  }));
});

test('Podcast Prep guest can preserve feedback_shared status during revisions but cannot set it', async () => {
  const guest = authedVerifiedDb('guest@example.com', 'guest-uid');
  await seed('podcast_sessions/podcast-1', podcastSession({ guestUid: 'guest-uid', status: 'feedback_shared' }));
  await assertSucceeds(updateDoc(podcastRef(guest), {
    completedQuestionCount: 1,
    status: 'feedback_shared',
    updatedAt: new Date(),
  }));

  await seed('podcast_sessions/podcast-2', podcastSession({
    sessionId: 'podcast-2',
    guestUid: 'guest-uid',
    status: 'in_progress',
  }));
  await assertFails(updateDoc(podcastRef(guest, 'podcast-2'), {
    status: 'feedback_shared',
    updatedAt: new Date(),
  }));
});

test('Podcast Prep Storage recordings are isolated by verified guest email, UID path and staff access', async (t) => {
  if (!process.env.STORAGE_EMULATOR_HOST) {
    t.skip('Storage emulator not running; run firebase emulators:exec --only firestore,storage.');
    return;
  }
  await seed('podcast_sessions/podcast-1', podcastSession({ guestUid: '' }));
  await seed('podcast_sessions/podcast-2', podcastSession({
    sessionId: 'podcast-2',
    guestEmail: 'other@example.com',
    normalizedGuestEmail: 'other@example.com',
    guestUid: 'other-uid',
  }));

  const otherStorage = authedVerifiedStorage('other@example.com', 'other-uid');
  const wrongEmailStorage = authedVerifiedStorage('wrong@example.com', 'wrong-uid');
  const staffStorage = authedVerifiedStorage('anmadaan@gmail.com', 'staff-uid');
  const anonStorage = testEnv.unauthenticatedContext().storage();
  const audio = new Blob(['audio'], { type: 'audio/webm' });
  const guestPath = 'podcast_recordings/podcast-1/guest-uid/q1/v1.webm';
  const otherPath = 'podcast_recordings/podcast-2/other-uid/q1/v1.webm';

  await assertSucceeds(updateDoc(podcastRef(authedVerifiedDb('guest@example.com', 'guest-uid')), {
    guestUid: 'guest-uid',
    status: 'opened',
    openedAt: new Date(),
    updatedAt: new Date(),
  }));
  await assertSucceeds(getDoc(podcastRef(authedVerifiedDb('guest@example.com', 'guest-uid'))));
  const guestStorage = authedVerifiedStorage('guest@example.com', 'guest-uid');
  await assertSucceeds(uploadBytes(storageRef(guestStorage, guestPath), audio));
  await assertFails(uploadBytes(storageRef(guestStorage, 'podcast_recordings/podcast-1/other-uid/q1/v2.webm'), audio));
  await assertFails(uploadBytes(storageRef(wrongEmailStorage, guestPath), audio));
  await assertFails(uploadBytes(storageRef(anonStorage, guestPath), audio));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(storageRef(context.storage(), otherPath), audio);
  });

  await assertSucceeds(getBytes(storageRef(guestStorage, guestPath)));
  await assertFails(getBytes(storageRef(guestStorage, otherPath)));
  await assertFails(getBytes(storageRef(otherStorage, guestPath)));
  await assertFails(getBytes(storageRef(wrongEmailStorage, guestPath)));
  await assertFails(getBytes(storageRef(anonStorage, guestPath)));
  await assertSucceeds(getBytes(storageRef(staffStorage, guestPath)));
  await assertSucceeds(getBytes(storageRef(staffStorage, otherPath)));
});

test('existing Storage namespaces keep interview and editorial calendar behavior', async (t) => {
  if (!process.env.STORAGE_EMULATOR_HOST) {
    t.skip('Storage emulator not running; run firebase emulators:exec --only firestore,storage.');
    return;
  }
  const guestStorage = authedVerifiedStorage('guest@example.com', 'guest-uid');
  const ordinaryStorage = authedVerifiedStorage('ordinary@example.com', 'ordinary-uid');
  const staffStorage = authedVerifiedStorage('anmadaan@gmail.com', 'staff-uid');
  const anonStorage = testEnv.unauthenticatedContext().storage();
  const image = new Blob(['image'], { type: 'image/png' });
  const audio = new Blob(['audio'], { type: 'audio/webm' });
  const interviewPath = 'interview_recordings/session-1/guest-uid/q1.webm';
  const calendarPath = 'editorial_calendar_images/item-1/image.png';

  await assertSucceeds(uploadBytes(storageRef(guestStorage, interviewPath), audio));
  await assertSucceeds(getBytes(storageRef(ordinaryStorage, interviewPath)));
  await assertFails(uploadBytes(storageRef(anonStorage, 'interview_recordings/session-2/anon/q1.webm'), audio));
  await assertFails(getBytes(storageRef(anonStorage, interviewPath)));

  await assertSucceeds(uploadBytes(storageRef(staffStorage, calendarPath), image));
  await assertSucceeds(getBytes(storageRef(anonStorage, calendarPath)));
  await assertFails(uploadBytes(storageRef(ordinaryStorage, 'editorial_calendar_images/item-2/image.png'), image));
});
