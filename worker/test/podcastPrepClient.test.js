import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function functionBody(name) {
  const start = html.indexOf(`function ${name}(`);
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
  assert.match(body, /Your recording uploaded, but we couldn't finish saving it/);
  assert.doesNotMatch(body, /triggerPodcastPrepTranscription/);
  assert.doesNotMatch(body, /\/podcast-prep\/transcribe/);
});

test('Podcast Prep guest save confirms authorization and binding before Storage upload', () => {
  const auth = functionBody('ensurePodcastPrepGuestUploadAuthorization');
  assert.match(auth, /currentUser\.reload\(\)/);
  assert.match(auth, /currentUser\.getIdToken\(true\)/);
  assert.match(auth, /db\.runTransaction\(function\(tx\)/);
  assert.match(auth, /podcastPrepNormalizeEmail\(latest\.guestEmail \|\| latest\.normalizedGuestEmail\)/);
  assert.match(auth, /latest\.guestUid && latest\.guestUid !== uid/);
  assert.match(auth, /patch\.guestUid = uid/);
  assert.match(auth, /tx\.update\(ref, patch\)/);

  const save = functionBody('savePodcastPrepResponse');
  assert.match(save, /ensurePodcastPrepGuestUploadAuthorization\(session\)\.then\(function\(authorizedSession\)/);
  assert.ok(save.indexOf('ensurePodcastPrepGuestUploadAuthorization(session)') < save.indexOf('storage.ref(storagePath).put'));
  assert.match(save, /state\.session = Object\.assign\(\{\}, state\.session \|\| \{\}, authorizedSession\)/);
  assert.match(save, /getPodcastRecordingStoragePath\(session\.id, currentUser\.uid, q\.id, versionRef\.id, state\.localBlob\.type\)/);
  assert.match(save, /logPodcastPrepUploadDiagnostics\(\{/);
  assert.ok(save.indexOf('guestUidBound') < save.indexOf('storage.ref(storagePath).put'));
});

test('Podcast Prep guest save still advances after persisted audio without automatic transcription', () => {
  const body = functionBody('savePodcastPrepResponse');
  assert.match(body, /storage\.ref\(storagePath\)\.put/);
  assert.match(body, /versionRef\.set\(versionData\)/);
  assert.match(body, /responseRef\.set\(responseData, \{merge:true\}\)/);
  assert.match(body, /db\.collection\('podcast_sessions'\)\.doc\(session\.id\)\.update\(sessionPatch\)/);
  assert.match(body, /status\.textContent = '✓ Recording saved'/);
  assert.match(body, /setTimeout\(resolve, 900\)/);
  assert.ok(body.indexOf("status.textContent = '✓ Recording saved'") < body.indexOf('state.activeIndex += 1'));
  assert.match(body, /if \(\(state\.session\.questions \|\| \[\]\)\[state\.activeIndex \+ 1\]\) state\.activeIndex \+= 1/);
  assert.match(body, /renderPodcastPrepQuestion\(\)/);
});

test('Podcast Prep guest save confirmation appears only after persistence succeeds', () => {
  const body = functionBody('savePodcastPrepResponse');
  const savedIndex = body.indexOf("status.textContent = '✓ Recording saved'");
  assert.notEqual(savedIndex, -1);
  assert.ok(body.indexOf('storage.ref(storagePath).put') < savedIndex);
  assert.ok(body.indexOf('versionRef.set(versionData)') < savedIndex);
  assert.ok(body.indexOf("responseRef.set(responseData, {merge:true})") < savedIndex);
  assert.ok(body.indexOf("db.collection('podcast_sessions').doc(session.id).update(sessionPatch)") < savedIndex);
  const catchStart = body.indexOf("}).catch(function(err) {");
  const catchBody = body.slice(catchStart);
  assert.doesNotMatch(catchBody, /✓ Recording saved/);
});

test('Podcast Prep guest save shows friendly retryable upload errors', () => {
  const body = functionBody('savePodcastPrepResponse');
  const catchStart = body.indexOf("}).catch(function(err) {");
  const finallyStart = body.indexOf("}).finally(function() {");
  const catchBody = body.slice(catchStart, finallyStart);
  assert.notEqual(catchStart, -1);
  assert.notEqual(finallyStart, -1);
  assert.match(body, /console\.warn\('Podcast Prep response save failed:', err\)/);
  assert.match(body, /stage: 'storage error code: ' \+ \(err && err\.code \|\| 'unknown'\)/);
  assert.match(body, /We couldn't save your recording\. Your recording is still available on this page\. Please try again\./);
  assert.match(body, /Your recording uploaded, but we couldn't finish saving it\. Your recording is still available on this page\. Please try again\./);
  assert.doesNotMatch(catchBody, /clearPodcastPrepLocalTake\(\)/);
  assert.doesNotMatch(body, /Could not upload your response: '\+err\.message/);
  assert.doesNotMatch(body, /storagePath \+ err\.message/);
});

test('Podcast Prep upload diagnostics are safe and do not expose tokens or recording contents', () => {
  const body = functionBody('logPodcastPrepUploadDiagnostics');
  assert.match(body, /console\.info\('\[PodcastPrep Upload\]'/);
  for (const key of ['authUidMatch', 'emailMatch', 'emailVerified', 'guestUidBound', 'mime', 'bytes', 'question', 'extension', 'stage']) {
    assert.match(body, new RegExp(`${key}:`));
  }
  assert.doesNotMatch(body, /getIdToken|idToken|Authorization|Bearer|access_token|refresh_token|localUrl|transcript|audio controls/);
});

test('Podcast Prep recording uses a real Web Audio waveform and cleans it up safely', () => {
  const start = functionBody('startPodcastPrepWaveform');
  assert.match(start, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(start, /ctx\.createAnalyser\(\)/);
  assert.match(start, /ctx\.createMediaStreamSource\(stream\)/);
  assert.match(start, /analyser\.getByteFrequencyData\(frequencyData\)/);
  assert.match(start, /analyser\.getByteTimeDomainData\(timeData\)/);
  assert.match(start, /var barCount = 42/);
  assert.match(start, /g\.fillRect\(x, y, barWidth, barHeight\)/);
  assert.doesNotMatch(start, /g\.lineTo/);
  assert.match(start, /level < 0\.18 \? 'Low'/);
  assert.match(start, /level < 0\.72 \? 'Good'/);
  assert.match(start, /'#f5c542'/);
  assert.match(start, /'#2f9e44'/);
  assert.match(start, /'#d64545'/);
  assert.match(start, /label\.textContent = levelState/);
  assert.match(start, /requestAnimationFrame\(draw\)/);
  assert.match(start, /console\.warn\('Podcast Prep waveform unavailable:'/);

  const stop = functionBody('stopPodcastPrepWaveform');
  assert.match(stop, /cancelAnimationFrame\(state\.waveformFrame\)/);
  assert.match(stop, /state\.analyserSource\.disconnect\(\)/);
  assert.match(stop, /state\.analyser\.disconnect\(\)/);
  assert.match(stop, /state\.audioContext\.close\(\)/);

  const record = functionBody('startPodcastPrepRecording');
  assert.match(record, /startPodcastPrepWaveform\(stream\)/);
  assert.match(record, /id="podcast-waveform"/);
  assert.match(record, /id="podcast-waveform-level"/);
  assert.match(record, /Recording\.\.\. 0:00/);

  const clear = functionBody('clearPodcastPrepLocalTake');
  assert.match(clear, /stopPodcastPrepWaveform\(\)/);
  assert.doesNotMatch(clear, /waveformData|analyserData/);
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

test('Podcast Prep staff playback uses secure Worker audio route without getDownloadURL', () => {
  const audio = functionBody('podcastAudioHtml');
  assert.match(audio, /workerFetchWithFirebaseAuthRaw\('\/podcast-prep\/audio-download'/);
  assert.match(audio, /response\.blob\(\)/);
  assert.match(audio, /URL\.createObjectURL\(blob\)/);
  assert.match(audio, /getAudioUrl\(version\.storagePath\)/);

  const staff = functionBody('renderPodcastPrepStaffDetail');
  assert.match(staff, /podcastAudioHtml\(v, audioId, session\.id, q\.id\)/);
});

test('Podcast Prep staff dashboard and detail expose copyable guest links without creating sessions', () => {
  const link = functionBody('buildPodcastPrepLink');
  assert.match(link, /\?podcastPrep=/);

  const copy = functionBody('copyPodcastPrepLink');
  assert.match(copy, /navigator\.clipboard\.writeText\(link\)/);
  assert.match(copy, /Guest link copied\./);
  assert.doesNotMatch(copy, /db\.collection\('podcast_sessions'\)/);

  const list = functionBody('renderPodcastPrepSessions');
  assert.match(list, /buildPodcastPrepLink\(s\.id\)/);
  assert.match(list, /Copy guest link/);
  assert.match(list, /copyPodcastPrepLink\(/);

  const detail = functionBody('renderPodcastPrepStaffDetail');
  assert.match(detail, /var guestLink = buildPodcastPrepLink\(session\.id\)/);
  assert.match(detail, /Guest link/);
  assert.match(detail, /Copy link/);
});

test('authenticated top bar shows current Firebase email while preserving Podcast Prep guest controls', () => {
  assert.match(html, /id="top-auth-email" class="top-auth-email"/);
  const nav = functionBody('updateAuthenticatedNavigationForMode');
  assert.match(nav, /email\.textContent = currentUser && currentUser\.email \? currentUser\.email : ''/);
  assert.match(nav, /email\.style\.display = currentUser && currentUser\.email \? 'inline-flex' : 'none'/);
  assert.match(nav, /sub\.textContent = isPodcastGuest \? 'Podcast Prep' : 'Editing Studio'/);
  assert.match(nav, /home\.style\.display = isStaff \? 'inline-flex' : 'none'/);
  assert.match(nav, /bell\.style\.display = currentUser && !isPodcastGuest \? 'inline-flex' : 'none'/);
});

test('Podcast Prep talking points are staff-authored, guest read-only and exported', () => {
  const editor = functionBody('renderPodcastPrepQuestionEditor');
  assert.match(editor, /Talking points for guest/);
  assert.match(editor, /data-podcast-talking-index/);
  assert.match(editor, /syncPodcastPrepTalkingPoints/);

  const create = functionBody('createPodcastPrepSession');
  assert.match(create, /talkingPoints:String\(q\.talkingPoints\|\|''\)\.trim\(\)/);

  const staff = functionBody('renderPodcastPrepStaffDetail');
  assert.match(staff, /podcast-question-talking-points/);
  assert.match(staff, /savePodcastPrepQuestionTalkingPoints/);

  const saveTalking = functionBody('savePodcastPrepQuestionTalkingPoints');
  assert.match(saveTalking, /questions: questions/);
  assert.match(saveTalking, /updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.doesNotMatch(saveTalking, /collection\('responses'\)/);
  assert.doesNotMatch(saveTalking, /collection\('versions'\)/);

  const guest = functionBody('renderPodcastPrepQuestion');
  assert.match(guest, /Talking points to help you prepare/);
  assert.match(guest, /String\(q\.talkingPoints \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(guest, /textarea[\s\S]*talkingPoints/);

  const docx = functionBody('downloadPodcastPrepDocx');
  assert.match(docx, /Talking points/);
  assert.match(docx, /q\.talkingPoints/);
});

test('staff can edit an existing Podcast Prep title and question text without changing identity or guest link', () => {
  const detail = functionBody('renderPodcastPrepStaffDetail');
  const save = functionBody('savePodcastPrepSessionContent');

  assert.match(detail, /Edit session/);
  assert.match(detail, /id="podcast-session-title-input"/);
  assert.match(detail, /class="podcast-question-text-input"/);
  assert.match(detail, /class="podcast-question-talking-points"/);
  assert.match(detail, /Save changes/);
  assert.match(detail, /Cancel/);
  assert.match(detail, /var guestLink = buildPodcastPrepLink\(session\.id\)/);

  assert.match(save, /db\.collection\('podcast_sessions'\)\.doc\(sessionId\)\.update/);
  assert.match(save, /podcastTitle: podcastTitle/);
  assert.match(save, /questions: questions/);
  assert.match(save, /updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(save, /Object\.assign\(\{\}, q,/);
  assert.match(save, /el\.getAttribute\('data-question-id'\) === q\.id/);
  assert.doesNotMatch(save, /q\.id\s*=|id:\s*'q'|order:/);
  assert.doesNotMatch(save, /sessionId:|guestLink:|completedQuestionCount:|status:|guestUid:|overallFeedback:/);
  assert.doesNotMatch(save, /collection\('responses'\)|collection\('versions'\)|storage\.|delete\(/);
  assert.match(save, /Session updated\./);
});

test('failed session-content save retains staff edits and cancel restores cached session content', () => {
  const save = functionBody('savePodcastPrepSessionContent');
  const editMode = functionBody('setPodcastPrepSessionEditMode');

  assert.match(save, /Could not update session\. Please try again\./);
  assert.doesNotMatch(save.slice(save.indexOf('.catch')), /renderPodcastPrepStaffDetail/);
  assert.match(editMode, /renderPodcastPrepStaffDetail\(detail\._podcastPrepSession, detail\._podcastPrepResponses \|\| \{\}, detail\._podcastPrepVersions \|\| \{\}\)/);
});

test('guest reload uses current session title and questions while saved response snapshots remain isolated', () => {
  const loader = functionBody('loadPodcastPrepGuestSession');
  const question = functionBody('renderPodcastPrepQuestion');
  const saveResponse = functionBody('savePodcastPrepResponse');
  const sessionSave = functionBody('savePodcastPrepSessionContent');

  assert.match(loader, /db\.collection\('podcast_sessions'\)\.doc\(sessionId\)\.get\(\)/);
  assert.match(loader, /window\._podcastPrepGuest\.session = updatedSession/);
  assert.match(question, /session\.podcastTitle/);
  assert.match(question, /q\.question/);
  assert.match(question, /q\.talkingPoints/);
  assert.match(saveResponse, /questionText: q\.question \|\| ''/);
  assert.match(saveResponse, /questionOrder: q\.order \|\| \(state\.activeIndex \+ 1\)/);
  assert.doesNotMatch(sessionSave, /questionText|questionOrder|transcript|storagePath|versionRef|responseRef/);
});

test('Podcast Prep security keeps content staff-editable and guest read-only without a rules change', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const sessionRules = rules.slice(rules.indexOf('match /podcast_sessions/{sessionId}'), rules.indexOf('match /editorial_config/{documentId}'));
  assert.match(sessionRules, /allow update: if isWocultStaff\(\)/);
  assert.match(rules, /request\.resource\.data\.questions == resource\.data\.questions/);
  assert.match(rules, /request\.resource\.data\.questionText == resource\.data\.questionText/);
  assert.match(rules, /request\.resource\.data\.questionOrder == resource\.data\.questionOrder/);
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
  const confirm = functionBody('confirmTranscribeAllPodcastPrepResponses');
  assert.match(confirm, /Generate transcripts\?/);
  assert.match(confirm, /using OpenAI/);
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

test('Podcast Prep guest shell reopens hidden landing parent without staff dashboard cards', () => {
  assert.match(html, /<div id="landing" class="app-workspace" style="display:none">/);
  assert.match(html, /<div id="landing-cards" class="landing" style="display:none">/);

  const hideAll = functionBody('hideAllAppScreens');
  assert.match(hideAll, /hideStaffLandingPanels\(\)/);

  const panels = functionBody('hideStaffLandingPanels');
  assert.match(panels, /'landing-cards'/);

  const shell = functionBody('showPodcastPrepGuestShell');
  assert.match(shell, /hideAllAppScreens\(\)/);
  assert.match(shell, /hideStaffLandingPanels\(\)/);
  assert.match(shell, /document\.getElementById\('landing'\)/);
  assert.match(shell, /landing\.style\.display = 'block'/);
  assert.match(shell, /document\.getElementById\('podcast-prep-guest-screen'\)/);
  assert.match(shell, /screen\.style\.display = 'flex'/);
  assert.ok(shell.indexOf('hideStaffLandingPanels()') < shell.indexOf("landing.style.display = 'block'"));

  const loader = functionBody('loadPodcastPrepGuestSession');
  assert.match(loader, /var root = showPodcastPrepGuestShell\(\)/);
  assert.doesNotMatch(loader, /hideAllAppScreens\(\);\s*document\.getElementById\('podcast-prep-guest-screen'\)\.style\.display = 'flex'/);
});

test('Podcast Prep route logs safe diagnostics and keeps staff dashboard hidden through resolution', () => {
  const logger = functionBody('logPodcastPrepRouteState');
  assert.match(logger, /console\.info\('\[PodcastPrep\]', message, details \|\| \{\}\)/);
  assert.doesNotMatch(logger, /idToken|Authorization|Bearer|downloadUrl|getDownloadURL/);

  const route = functionBody('routeSignedInUser');
  assert.match(route, /logPodcastPrepRouteState\('route detected', \{hasSessionId: true\}\)/);
  assert.match(route, /logPodcastPrepRouteState\('auth resolved'/);
  assert.match(route, /logPodcastPrepRouteState\('rendering', \{target: 'staff_review', staff: true\}\)/);

  const loader = functionBody('loadPodcastPrepGuestSession');
  assert.match(loader, /logPodcastPrepRouteState\('opening guest route'/);
  assert.match(loader, /logPodcastPrepRouteState\('access check result'/);
  assert.match(loader, /logPodcastPrepRouteState\('rendering', \{target: 'guest'\}\)/);
  assert.match(loader, /logPodcastPrepRouteState\('rendering', \{target: 'error'\}\)/);
  assert.doesNotMatch(loader, /goToLanding\(\)/);
});

test('Podcast Prep route remains ahead of Guest Writer and preserves session id through sign-in', () => {
  const router = functionBody('routeSignedInUser');
  assert.match(router, /var podcastPrepId = getPendingPodcastPrepSessionId\(\)/);
  assert.match(router, /if \(podcastPrepId\) \{/);
  assert.match(router, /rememberPodcastPrepRoute\(podcastPrepId\)/);
  assert.match(router, /loadPodcastPrepGuestSession\(podcastPrepId\)/);
  assert.ok(router.indexOf('if (podcastPrepId) {') < router.indexOf("currentAccessMode = 'guest_writer'"));
  assert.ok(router.indexOf('if (podcastPrepId) {') < router.indexOf('goToLanding()'));
  assert.match(router, /if \(isStaffUser\(user\)\) \{[\s\S]*openPodcastPrepStaffSessionFromRoute\(podcastPrepId\)/);

  const remember = functionBody('rememberPodcastPrepRoute');
  assert.match(remember, /sessionStorage\.setItem\('wocultAccessMode', 'podcast_prep_guest'\)/);
  assert.match(remember, /sessionStorage\.setItem\('wocultPodcastPrepSessionId', sessionId\)/);
  assert.match(remember, /sessionStorage\.setItem\('pendingPodcastPrepSessionId', sessionId\)/);

  const pending = functionBody('getPendingPodcastPrepSessionId');
  assert.match(pending, /getPodcastPrepIdFromUrl\(\)/);
  assert.match(pending, /sessionStorage\.getItem\('pendingPodcastPrepSessionId'\)/);
  assert.match(pending, /sessionStorage\.getItem\('wocultPodcastPrepSessionId'\)/);

  const boot = html.slice(html.indexOf('var accessKeyFromUrl ='), html.indexOf('</script>', html.indexOf('var accessKeyFromUrl =')));
  assert.match(boot, /if \(podcastPrepFromUrl\) \{/);
  assert.ok(boot.indexOf('if (podcastPrepFromUrl) {') < boot.indexOf("accessKeyFromUrl && accessKeyFromUrl.trim().toUpperCase().indexOf('INT-')"));
});

test('Podcast Prep auth restoration blocks Guest Writer onboarding for email and Google login', () => {
  const email = functionBody('submitEmailAuth');
  const google = functionBody('signInWithGoogle');
  const opening = functionBody('showPendingPodcastPrepOpeningState');
  const loader = functionBody('loadPodcastPrepGuestSession');

  assert.match(email, /showPendingPodcastPrepOpeningState\(\)/);
  assert.match(google, /showPendingPodcastPrepOpeningState\(\)/);
  assert.ok(email.indexOf('showPendingPodcastPrepOpeningState()') < email.indexOf('auth.signInWithEmailAndPassword'));
  assert.ok(google.indexOf('showPendingPodcastPrepOpeningState()') < google.indexOf('auth.signInWithPopup'));
  assert.match(opening, /currentAccessMode = 'podcast_prep_guest'/);
  assert.match(opening, /showPodcastPrepGuestShell\(\)/);
  assert.match(opening, /Opening Podcast Prep/);
  assert.doesNotMatch(opening, /loadGuestWriterProfile|showGuestWriterRegistration/);
  assert.match(loader, /renderPodcastPrepAccessDenied\(\)/);
  assert.match(loader, /renderPodcastPrepRouteError/);
  assert.doesNotMatch(loader, /loadGuestWriterProfile|showGuestWriterRegistration/);
  assert.doesNotMatch(email, /routeSignedInUser|loadGuestWriterProfile|showGuestWriterRegistration|goToLanding/);
  assert.doesNotMatch(google, /routeSignedInUser|loadGuestWriterProfile|showGuestWriterRegistration|goToLanding/);
});

test('Podcast Prep route is captured before login and one auth-state router owns destination selection', () => {
  const capture = html.indexOf('var initialPodcastPrepSessionId = getPodcastPrepIdFromUrl()');
  const setup = html.indexOf('setupUnsavedChangeTracking();');
  const boot = html.slice(html.indexOf('var accessKeyFromUrl ='), html.indexOf('</script>', html.indexOf('var accessKeyFromUrl =')));
  const authState = functionBody('handleAuthStateChanged');

  assert.notEqual(capture, -1);
  assert.ok(capture < setup);
  assert.match(html.slice(capture, setup), /sessionStorage\.setItem\('pendingPodcastPrepSessionId', initialPodcastPrepSessionId\)/);
  assert.match(boot, /auth\.onAuthStateChanged\(handleAuthStateChanged\)/);
  assert.doesNotMatch(boot, /onAuthStateChanged\(function/);
  assert.match(authState, /routeSignedInUser\(user\)/);
  assert.match(authState, /showAccessScreen\(\)/);
});

test('a pending Podcast Prep session makes Guest Writer onboarding unreachable for that routing pass', () => {
  const router = functionBody('routeSignedInUser');
  const pendingBranch = router.indexOf('if (podcastPrepId) {');
  const podcastReturn = router.indexOf('return loadPodcastPrepGuestSession(podcastPrepId)');
  const writerFallback = router.indexOf('return loadGuestWriterProfile(user.uid)');

  assert.ok(pendingBranch !== -1 && podcastReturn > pendingBranch);
  assert.ok(writerFallback > podcastReturn);
  assert.match(router.slice(pendingBranch, writerFallback), /return loadPodcastPrepGuestSession\(podcastPrepId\)/);
});

test('Podcast Prep pending route clears only after a Podcast Prep state renders', () => {
  const clear = functionBody('clearPendingPodcastPrepRoute');
  const guest = functionBody('loadPodcastPrepGuestSession');
  const denied = functionBody('renderPodcastPrepAccessDenied');
  const unverified = functionBody('renderPodcastPrepVerifyEmail');

  assert.match(clear, /removeItem\('pendingPodcastPrepSessionId'\)/);
  assert.match(guest, /renderPodcastPrepGuestWelcome\(\);[\s\S]*clearPendingPodcastPrepRoute\(\)/);
  assert.match(denied, /This Podcast Prep invitation was sent to a different email address/);
  assert.match(denied, /podcastPrepSignedInEmailHtml\(\)/);
  assert.match(denied, /clearPendingPodcastPrepRoute\(\)/);
  assert.match(unverified, /clearPendingPodcastPrepRoute\(\)/);
  assert.doesNotMatch(functionBody('renderPodcastPrepRouteError'), /clearPendingPodcastPrepRoute/);
});

test('shared login password visibility is accessible and does not persist the password', () => {
  assert.match(html, /id="login-password" type="password"/);
  assert.match(html, /id="login-password-toggle"[^>]*aria-label="Show password"[^>]*aria-controls="login-password"[^>]*aria-pressed="false"/);
  assert.match(html, /id="login-password-toggle"[^>]*onclick="togglePasswordVisibility\(\)"/);

  const toggle = functionBody('togglePasswordVisibility');
  assert.match(toggle, /field\.type = show \? 'text' : 'password'/);
  assert.match(toggle, /toggle\.textContent = show \? 'Hide password' : 'Show password'/);
  assert.match(toggle, /setAttribute\('aria-label'/);
  assert.match(toggle, /setAttribute\('aria-pressed'/);
  assert.doesNotMatch(toggle, /field\.value\s*=/);
  assert.doesNotMatch(toggle, /localStorage|sessionStorage|location|console/);

  const reset = functionBody('resetPasswordVisibility');
  assert.match(reset, /field\.type = 'password'/);
  assert.match(functionBody('showAccessScreen'), /resetPasswordVisibility\(\)/);
});

test('staff dashboard rendering requires explicit staff authorization', () => {
  const staff = functionBody('isStaffUser');
  assert.match(staff, /STAFF_EMAILS\.indexOf\(\(user\.email \|\| ''\)\.toLowerCase\(\)\) !== -1/);

  const landing = functionBody('goToLanding');
  assert.match(landing, /currentAccessMode !== 'staff' \|\| !isStaffUser\(currentUser\)/);
  assert.match(landing, /renderNonStaffAccessScreen\(\); return/);
  assert.ok(landing.indexOf("currentAccessMode !== 'staff' || !isStaffUser(currentUser)") < landing.indexOf("document.getElementById('landing').style.display = 'block'"));

  const route = functionBody('routeSignedInUser');
  assert.match(route, /if \(isStaffUser\(user\)\) \{[\s\S]*currentAccessMode = 'staff'[\s\S]*goToLanding\(\)/);
  assert.ok(route.indexOf('if (isStaffUser(user)) {') < route.indexOf("currentAccessMode = 'guest_writer'"));
});

test('Podcast Prep guest header hides staff Home and notification controls', () => {
  const nav = functionBody('updateAuthenticatedNavigationForMode');
  assert.match(nav, /var isStaff = isStaffUser\(currentUser\)/);
  assert.match(nav, /var isPodcastGuest = currentAccessMode === 'podcast_prep_guest'/);
  assert.match(nav, /home\.style\.display = isStaff \? 'inline-flex' : 'none'/);
  assert.match(nav, /bell\.style\.display = currentUser && !isPodcastGuest \? 'inline-flex' : 'none'/);
  assert.match(nav, /logoutBtn\.style\.display = currentUser \? 'inline-flex' : 'none'/);

  const shell = functionBody('showPodcastPrepGuestShell');
  assert.match(shell, /updateAuthenticatedNavigationForMode\(\)/);
});

test('non-staff root access gets limited access screen, not staff dashboard', () => {
  const screen = functionBody('renderNonStaffAccessScreen');
  assert.match(screen, /This account does not have staff access to Wocult Editing Studio/);
  assert.doesNotMatch(screen, /goToLanding\(\)/);

  const guard = functionBody('guardStaffScreen');
  assert.match(guard, /renderNonStaffAccessScreen\(\)/);
  assert.doesNotMatch(guard, /loadGuestWriterProfile\(currentUser\.uid\)/);

  const enforce = functionBody('enforceStaffScreenAccess');
  assert.match(enforce, /renderNonStaffAccessScreen\(\)/);
});

test('Podcast Prep guest states visibly show authenticated email and never render blank errors', () => {
  const email = functionBody('podcastPrepSignedInEmailHtml');
  assert.match(email, /currentUser && currentUser\.email/);
  assert.match(email, /Signed in as:/);

  const welcome = functionBody('renderPodcastPrepGuestWelcome');
  assert.match(welcome, /podcastPrepSignedInEmailHtml\(\)/);
  assert.match(welcome, /Continue Preparation|Start Preparation/);

  const question = functionBody('renderPodcastPrepQuestion');
  assert.match(question, /if \(!root\) return/);
  assert.match(question, /podcastPrepSignedInEmailHtml\(\)/);
  assert.match(question, /Question '\+\(idx\+1\)\+'/);

  const review = functionBody('showPodcastPrepSubmitReview');
  assert.match(review, /if \(!root\) return/);
  assert.match(review, /podcastPrepSignedInEmailHtml\(\)/);

  const denied = functionBody('renderPodcastPrepAccessDenied');
  assert.match(denied, /showPodcastPrepGuestShell\(\)/);
  assert.match(denied, /This Podcast Prep invitation was sent to a different email address/);
  assert.match(denied, /podcastPrepSignedInEmailHtml\(\)/);
  assert.doesNotMatch(denied, /invitedEmail/);

  const verify = functionBody('renderPodcastPrepVerifyEmail');
  assert.match(verify, /showPodcastPrepGuestShell\(\)/);
  assert.match(verify, /podcastPrepSignedInEmailHtml\(\)/);
  assert.match(verify, /Resend verification email/);

  const routeError = functionBody('renderPodcastPrepRouteError');
  assert.match(routeError, /showPodcastPrepGuestShell\(\)/);
  assert.match(routeError, /Could not open Podcast Prep/);
  assert.match(routeError, /Try again/);
  assert.match(routeError, /Sign out/);
});

test('Podcast Prep guest access-check and invalid session failures render useful states', () => {
  const loader = functionBody('loadPodcastPrepGuestSession');
  assert.match(loader, /renderPodcastPrepRouteError\('This Podcast Prep link is missing or invalid\.'\)/);
  assert.match(loader, /if \(access\.reason === 'unverified'\) \{[\s\S]*renderPodcastPrepVerifyEmail\(\)/);
  assert.match(loader, /else \{[\s\S]*renderPodcastPrepAccessDenied\(\)/);
  assert.match(loader, /renderPodcastPrepAccessDenied\(\)/);
  assert.match(loader, /renderPodcastPrepVerifyEmail\(\)/);
  assert.match(loader, /console\.error\('Could not open Podcast Prep session:', err\)/);
  assert.match(loader, /renderPodcastPrepRouteError\("We couldn't open this Podcast Prep session\."\)/);
});

test('Podcast Prep Create guest link button is wired to the create handler', () => {
  assert.match(html, /id="podcast-prep-create-btn" onclick="createPodcastPrepSession\(\)"/);
  const create = functionBody('createPodcastPrepSession');
  assert.match(create, /db\.collection\('podcast_sessions'\)\.doc\(\)/);
  assert.match(create, /docRef\.set\(data\)/);
});

test('Podcast Prep create saves ordered questions, normalized guest email and guest URL', () => {
  const create = functionBody('createPodcastPrepSession');
  assert.match(create, /syncPodcastPrepQuestionEditorFromDom\(\)/);
  assert.match(create, /id:'q'\+\(i\+1\), order:i\+1, question:String\(q\.question\|\|''\)\.trim\(\)/);
  assert.match(create, /talkingPoints:String\(q\.talkingPoints\|\|''\)\.trim\(\)/);
  assert.match(create, /normalizedGuestEmail: podcastPrepNormalizeEmail\(guestEmail\)/);
  assert.match(create, /guestUid: ''/);
  assert.match(create, /status: 'sent'/);
  assert.match(create, /createdAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(create, /updatedAt: firebase\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(create, /var link = buildPodcastPrepLink\(id\)/);
  assert.match(create, /guestLink: link/);
  assert.match(create, /escapeAttr\(link\)/);
  assert.match(create, /copyPodcastPrepLink/);
  const linkBuilder = functionBody('buildPodcastPrepLink');
  assert.match(linkBuilder, /\?podcastPrep=/);
});

test('Podcast Prep create shows visible validation and backend errors instead of silent no-op', () => {
  const create = functionBody('createPodcastPrepSession');
  assert.match(create, /setPodcastPrepCreateStatus\('Enter the podcast \/ episode title\.', true\)/);
  assert.match(create, /setPodcastPrepCreateStatus\('Enter the guest name\.', true\)/);
  assert.match(create, /setPodcastPrepCreateStatus\('Enter the guest email\.', true\)/);
  assert.match(create, /setPodcastPrepCreateStatus\('Add at least one question\.', true\)/);
  assert.doesNotMatch(create, /alert\(/);
  assert.match(create, /console\.error\('Could not create Podcast Prep:', err\)/);
  assert.match(create, /setPodcastPrepCreateStatus\("We couldn't create this Podcast Prep link\. Please try again\.", true\)/);
  assert.match(create, /finishPodcastPrepCreateButton\(false\)/);
});

test('Podcast Prep create disables duplicate clicks while creation is in progress', () => {
  const create = functionBody('createPodcastPrepSession');
  assert.match(create, /if \(window\._podcastPrepCreating\) return false/);
  assert.match(create, /window\._podcastPrepCreating = true/);
  assert.match(create, /btn\.disabled = true/);
  assert.match(create, /btn\.textContent = 'Creating\.\.\.'/);
  assert.match(create, /window\._podcastPrepCreating = false/);
  assert.match(create, /finishPodcastPrepCreateButton\(true\)/);

  const reset = functionBody('showPodcastPrepCreate');
  assert.match(reset, /window\._podcastPrepCreating = false/);
  assert.match(reset, /finishPodcastPrepCreateButton\(false\)/);
});

test('application version badge is 15.23', () => {
  assert.match(html, /id="app-version">v15\.23<\/small>/);
  assert.doesNotMatch(html, />15\.20<\/div>/);
  assert.doesNotMatch(html, />15\.19<\/div>/);
  assert.doesNotMatch(html, />15\.18<\/div>/);
  assert.doesNotMatch(html, />15\.17<\/div>/);
  assert.doesNotMatch(html, />15\.16<\/div>/);
  assert.doesNotMatch(html, />15\.15<\/div>/);
  assert.doesNotMatch(html, />15\.14<\/div>/);
  assert.doesNotMatch(html, />15\.13<\/div>/);
  assert.doesNotMatch(html, />15\.12<\/div>/);
  assert.doesNotMatch(html, />15\.11<\/div>/);
});
