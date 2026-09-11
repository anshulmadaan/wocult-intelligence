import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function functionBody(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} not found`);
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
  throw new Error(`${name} body not closed`);
}

test('Podcast Prep final submit is transaction-backed and idempotent per session', () => {
  const body = functionBody('submitPodcastPrepFinal');
  assert.match(body, /db\.runTransaction\(function\(tx\)/);
  assert.match(body, /tx\.get\(sessionRef\)/);
  assert.match(body, /latest\.status === 'submitted'/);
  assert.match(body, /return \{alreadySubmitted:true, completedQuestionCount: latest\.completedQuestionCount \|\| completedCount\}/);
  assert.match(body, /sessionRef\.collection\('responses'\)\.doc\(q\.id\)/);
  assert.match(body, /responseDoc\.exists/);
  assert.match(body, /hasSavedResponse/);
  assert.match(body, /db\.collection\('notifications'\)\.doc\('podcast_prep_submitted_' \+ session\.id\)/);
  assert.match(body, /tx\.set\(notificationRef/);
  assert.doesNotMatch(body, /createNotification\(\{\s*recipientRole: 'staff'[\s\S]*type: 'podcast_prep_submitted'/);
});

test('Podcast Prep save cleans up only newly uploaded unregistered audio after Firestore failure', () => {
  const body = functionBody('savePodcastPrepResponse');
  assert.match(body, /var uploadCompleted = false/);
  assert.match(body, /var versionRegistered = false/);
  assert.match(body, /uploadCompleted = true/);
  assert.match(body, /transcriptionStatus: 'not_requested'/);
  assert.match(body, /transcriptionSource: ''/);
  assert.match(body, /versionRef\.set\(versionData\)\.then\(function\(\)\{ versionRegistered = true/);
  assert.match(body, /if \(uploadCompleted && !versionRegistered && storagePath\)/);
  assert.match(body, /storage\.ref\(storagePath\)\.delete\(\)\.catch/);
  assert.match(body, /console\.warn\('Podcast Prep cleanup failed for unregistered audio:'/);
  assert.match(body, /Please retry without closing this page/);
  assert.doesNotMatch(body, /triggerPodcastPrepTranscription/);
  assert.doesNotMatch(body, /\/podcast-prep\/transcribe/);
});

test('Podcast Prep guest save still advances after persisted audio without automatic transcription', () => {
  const body = functionBody('savePodcastPrepResponse');
  assert.match(body, /storage\.ref\(storagePath\)\.put/);
  assert.match(body, /versionRef\.set\(versionData\)/);
  assert.match(body, /responseRef\.set\(responseData, \{merge:true\}\)/);
  assert.match(body, /db\.collection\('podcast_sessions'\)\.doc\(session\.id\)\.update\(sessionPatch\)/);
  assert.match(body, /if \(\(state\.session\.questions \|\| \[\]\)\[state\.activeIndex \+ 1\]\) state\.activeIndex \+= 1/);
  assert.match(body, /renderPodcastPrepQuestion\(\)/);
});

test('Podcast Prep final submit does not start transcription', () => {
  const body = functionBody('submitPodcastPrepFinal');
  assert.doesNotMatch(body, /triggerPodcastPrepTranscription/);
  assert.doesNotMatch(body, /\/podcast-prep\/transcribe/);
});

test('Podcast Prep staff review exposes explicit transcription, audio download and manual transcript controls', () => {
  const render = functionBody('renderPodcastPrepStaffDetail');
  assert.match(render, /Transcribe responses/);
  assert.match(render, /Transcribe this response/);
  assert.match(render, /Retry transcription/);
  assert.match(render, /Download audio/);
  assert.match(render, /Add transcript manually/);
  assert.match(render, /Save transcript/);
  assert.match(render, /podcastPrepEligibleTranscriptionVersions/);
});

test('Podcast Prep bulk transcription processes eligible responses sequentially and skips completed ones', () => {
  const eligible = functionBody('podcastPrepTranscriptionEligible');
  assert.match(eligible, /status === 'not_requested'/);
  assert.match(eligible, /status === 'failed'/);
  assert.doesNotMatch(eligible, /completed/);
  const bulk = functionBody('transcribeAllPodcastPrepResponses');
  assert.match(bulk, /var chain = Promise\.resolve\(\)/);
  assert.match(bulk, /chain = chain\.then/);
  assert.match(bulk, /Transcribing '\+\(index \+ 1\)\+' of '\+items\.length\+' responses/);
});

test('Podcast Prep audio download uses authorized Storage access and does not mutate Firestore or transcribe', () => {
  const body = functionBody('downloadPodcastPrepAudio');
  assert.match(body, /workerFetchWithFirebaseAuthRaw\('\/podcast-prep\/audio-download'/);
  assert.match(body, /sessionId:sessionId, questionId:questionId, versionId:versionId/);
  assert.match(body, /response\.blob\(\)/);
  assert.match(body, /Content-Disposition/);
  assert.match(body, /downloadBlob\(result\.blob, result\.filename\)/);
  assert.doesNotMatch(body, /getAudioUrl/);
  assert.doesNotMatch(body, /getDownloadURL/);
  assert.doesNotMatch(body, /\.update\(/);
  assert.doesNotMatch(body, /triggerPodcastPrepTranscription/);
  assert.doesNotMatch(body, /createNotification/);
});

test('Podcast Prep manual transcript save updates only the selected response version', () => {
  const body = functionBody('savePodcastPrepManualTranscript');
  assert.match(body, /collection\('responses'\)\.doc\(questionId\)\.collection\('versions'\)\.doc\(versionId\)\.update/);
  assert.match(body, /transcriptionStatus: 'completed'/);
  assert.match(body, /transcriptionSource: 'manual'/);
  assert.match(body, /transcriptUpdatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(body, /transcriptUpdatedBy: currentUser && currentUser\.uid/);
  assert.doesNotMatch(body, /triggerPodcastPrepTranscription/);
});

test('Podcast Prep DOCX export includes manual transcripts and not_requested status without transcription', () => {
  const body = functionBody('downloadPodcastPrepDocx');
  assert.match(body, /v\.transcriptionStatus === 'completed' && v\.transcript/);
  assert.match(body, /Transcript not generated\./);
  assert.match(body, /Transcript being prepared\./);
  assert.match(body, /Transcript unavailable\./);
  assert.doesNotMatch(body, /triggerPodcastPrepTranscription/);
});
