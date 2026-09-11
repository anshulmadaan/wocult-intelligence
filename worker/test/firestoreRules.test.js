import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const firebaseConfig = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const wranglerToml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

test('firebase.json references Firestore and Storage rules without introducing .firebaserc', () => {
  assert.deepEqual(firebaseConfig, {
    firestore: { rules: 'firestore.rules' },
    storage: { rules: 'storage.rules' },
  });
  assert.equal(existsSync(new URL('../../.firebaserc', import.meta.url)), false);
});

test('existing staff emails and automation collection rules remain unchanged', () => {
  for (const email of ['poorvi.arya23@gmail.com', 'divya.madaan@gmail.com', 'anmadaan@gmail.com']) {
    assert.match(rules, new RegExp(`"${email}"`));
  }
  assert.match(rules, /match \/news_brief_automation\/\{candidateId\} \{/);
  assert.match(rules, /allow read: if isWocultStaff\(\);/);
  assert.match(rules, /allow update: if isWocultStaff\(\);/);
  assert.match(rules, /allow create, delete: if false;/);
  assert.match(rules, /match \/activity\/\{activityId\} \{/);
  assert.match(rules, /allow create: if isWocultStaff\(\);/);
  assert.match(rules, /match \/news_brief_automation_runs\/\{runId\} \{/);
  assert.match(rules, /allow write: if false;/);
});

test('Canva admin identity and authenticated-only read are encoded exactly', () => {
  assert.match(rules, /function isCanvaAdmin\(\) \{/);
  assert.match(rules, /request\.auth\.token\.email == "anmadaan@gmail\.com"/);
  assert.match(rules, /match \/editorial_config\/canva_templates \{/);
  assert.match(rules, /allow read: if request\.auth != null;/);
  assert.match(compact(rules), /allow create: if isCanvaAdmin\(\) && validCanvaConfiguration\(\);/);
  assert.match(compact(rules), /allow update: if isCanvaAdmin\(\) && validCanvaConfiguration\(\);/);
  assert.match(rules, /allow delete: if false;/);
});

test('Canva configuration allows only the exact four template keys and exact template properties', () => {
  assert.match(compact(rules), /request\.resource\.data\.keys\(\)\.hasOnly\(\[ "template1", "template2", "template3", "template4" \]\)/);
  for (const key of ['template1', 'template2', 'template3', 'template4']) {
    assert.match(rules, new RegExp(`isValidCanvaTemplate\\(request\\.resource\\.data\\.${key}\\)`));
  }
  assert.match(compact(rules), /template\.keys\(\)\.hasOnly\(\[ "name", "description", "canvaUrl", "previewImageUrl", "enabled", "fields" \]\)/);
  assert.match(rules, /template\.name is string/);
  assert.match(rules, /template\.description is string/);
  assert.match(rules, /template\.enabled is bool/);
});

test('Canva field validation restricts keys, types and counts', () => {
  assert.match(compact(rules), /field\.keys\(\)\.hasOnly\(\["id", "type", "label"\]\)/);
  assert.match(rules, /field\.id is string/);
  assert.match(rules, /field\.label is string/);
  assert.match(compact(rules), /field\.type in \["headline", "subtitle", "bullet"\]/);
  assert.match(compact(rules), /size == 1 && isValidCanvaFields1\(fields\)/);
  assert.match(compact(rules), /size == 7 && isValidCanvaFields7\(fields\)/);
  assert.match(compact(rules), /fields\[0\]\.type == "headline"/);
  assert.match(compact(rules), /fields\[1\]\.type != "headline"/);
  assert.match(compact(rules), /fields\[1\]\.type == "subtitle"/);
  assert.match(compact(rules), /fields\[6\]\.type == "bullet"/);
});

test('Canva URL validation supports safe remote URLs and local preview fallbacks', () => {
  assert.match(rules, /value\.matches\('\^https\?:\/\/\.\+'\)/);
  for (const asset of ['assets/canva-template-1.png', 'assets/canva-template-2.png', 'assets/canva-template-3.png']) {
    assert.match(rules, new RegExp(`"${asset.replace('.', '\\.')}"`));
  }
  assert.match(rules, /value == ""/);
  assert.match(rules, /isSafeCanvaUrl\(template\.canvaUrl\)/);
  assert.match(rules, /isSafePreviewImageUrl\(template\.previewImageUrl\)/);
});

test('catch-all rule excludes editorial_config while preserving non-Canva compatibility access', () => {
  assert.match(rules, /match \/editorial_config\/\{documentId\} \{/);
  assert.match(rules, /allow read, write: if documentId != "canva_templates";/);
  assert.match(rules, /match \/\{collection\}\/\{document=\*\*\} \{/);
  assert.match(rules, /collection != "news_brief_automation"/);
  assert.match(rules, /collection != "news_brief_automation_runs"/);
  assert.match(rules, /collection != "podcast_sessions"/);
  assert.match(rules, /collection != "editorial_config"/);
});

test('Podcast Prep collection has explicit authenticated guest and staff rules', () => {
  assert.match(rules, /match \/podcast_sessions\/\{sessionId\} \{/);
  assert.match(rules, /allow list: if isWocultStaff\(\);/);
  assert.match(rules, /allow get: if canAccessPodcastSession\(sessionId\);/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /normalizedGuestEmail == authedEmailLower\(\)/);
  assert.match(rules, /match \/responses\/\{questionId\} \{/);
  assert.match(rules, /match \/versions\/\{versionId\} \{/);
  assert.match(rules, /storagePath\.matches\('\^podcast_recordings\//);
  assert.match(rules, /request\.resource\.data\.transcriptionStatus == "not_requested"/);
  assert.match(rules, /"transcriptionSource"/);
  assert.match(rules, /allow update: if isWocultStaff\(\);/);
});

test('source-controlled Worker vars declare WEBFLOW_SITE_ID without adding Webflow secrets', () => {
  assert.match(wranglerToml, /\[vars\]/);
  assert.match(wranglerToml, /NEWS_BRIEF_MAX_ITEMS_PER_RUN = "1"/);
  assert.match(wranglerToml, /WEBFLOW_SITE_ID = "6953cd76905788ee99a03a6c"/);
  assert.doesNotMatch(wranglerToml, /WEBFLOW_TOKEN\s*=/);
  assert.doesNotMatch(wranglerToml, /WEBFLOW_API_TOKEN\s*=/);
});
