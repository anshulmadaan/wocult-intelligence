import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(resolve(process.argv[2]||'tmp/theme-reference-15.24/tooling/node_modules/playwright/index.mjs')));
const out=resolve(process.argv[3]||'tmp/theme-15.27/deep');mkdirSync(out,{recursive:true});
const source=resolve(process.argv[4]||'.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='theme.test')return route.fulfill({status:503,body:'{"error":"Read-only fixture"}',contentType:'application/json'});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','app-navigation.js','app-ui.css','app-ui.js'].includes(name)&&!name.startsWith('assets/fonts/'))return route.fulfill({status:404,body:''});
 return route.fulfill({body:readFileSync(resolve(source,name)),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'}[extname(name)]});
});
await page.goto('http://theme.test');await page.waitForFunction(()=>typeof showAppSection==='function');
await page.evaluate(()=>{
 window.qaSession={id:'qa-session',podcastTitle:'The changing workplace',guestName:'Sample guest',guestEmail:'guest@example.test',guestIntro:'Prepare your thoughts in your own words.',status:'feedback_shared',questions:[{id:'q1',order:1,question:'What has changed in how your team works?',talkingPoints:'Consider one specific example and what you learned.'}],completedQuestionCount:1,questionCount:1};
 window.qaReadDb={collection(){const q={where(){return q},orderBy(){return q},limit(){return q},doc(){return q},collection(){return q},get:async()=>({exists:false,docs:[],empty:true,forEach(){}})};return q}};
 window.qaStory={id:'qa-story',writerName:'Sample writer',writerEmail:'guest@example.test',title:'Learning to lead',workingTitle:'Learning to lead',status:'draft',body:'<p>A story about learning from a team.</p>',ideaSummary:'A personal account of change at work.',preferredSection:'Health',sourceType:'guest_writer'};
 window.qaMount=(id,mode='staff')=>{
  hideAllAppScreens();hideStaffLandingPanels();db=null;currentUser={uid:'qa-user',email:mode==='staff'?ADMIN_EMAIL:'guest@example.test',emailVerified:true};currentAccessMode=mode;
  const el=document.getElementById(id);if(!el)throw Error('Unknown screen '+id);
  if(el.closest('#landing'))document.getElementById('landing').style.display='block';
  el.style.display=id==='workflow'||id==='main'?'block':'flex';
  updateAuthenticatedNavigationForMode();renderAppShell();
 };
});
const cases=[
 ['home',()=>showAppSection('home')],['draft',()=>showAppSection('draft')],
 ['trending',()=>{qaMount('main');activeTab='newsTracker';newsTrackerCards=[normalizeNewsTrackerCard({dateFound:new Date().toISOString(),headline:'Teams rethink the working week',source:'Example source',link:'https://example.test/story',theme:'Work culture'})];setCardsForActiveTab(newsTrackerCards);}],
 ['news-brief',()=>{qaMount('main');showNewsBriefBriefStep({title:'Teams rethink the working week',link:'https://example.test/story',src:'Example source',ago:'1h ago'});} ],
 ['news-generate',()=>{qaMount('workflow');showWorkflowStep('generate');}],
 ['news-refine',()=>{qaMount('workflow');document.getElementById('step1').style.display='none';document.getElementById('step2').style.display='none';document.getElementById('step3').style.display='none';document.getElementById('step2b').style.display='flex';document.getElementById('chat-article-preview').innerHTML='<h2>Teams rethink the working week</h2><p>Work is changing. This sample copy exercises the existing refinement editor.</p>'; }],
 ['news-review',()=>{qaMount('workflow');document.getElementById('step2b').style.display='none';document.getElementById('step3').style.display='block';}],
 ['url',()=>{qaMount('landing-url');}],['scratch-choice',()=>{qaMount('landing-scratch-choice');}],['scratch',()=>{qaMount('landing-scratch');}],
 ['manual-brief',()=>{qaMount('landing-manual-news-brief');}],['manual-brief-review',()=>{qaMount('landing-manual-news-review');}],['manual-long',()=>{qaMount('landing-manual-long-view');}],['manual-long-review',()=>{qaMount('landing-manual-long-review');}],
 ['automated',()=>{qaMount('landing-automated-news-briefs');renderAutomatedNewsBriefTabs();renderAutomatedNewsBriefList();}],
 ['interviews',()=>showAppSection('interviews')],['interview-create',()=>{qaMount('landing-prepare-interview');}],
 ['interview-detail',()=>{qaMount('landing-interview-submissions');renderInterviewSubmissionDetail({guestKey:'qa',guestName:'Sample guest',guestEmail:'guest@example.test',interviewTitle:'Work and identity',status:'submitted',questions:[{id:'q1',question:'What matters most in your work?'}],rawAnswers:[{questionId:'q1',answerHtml:'<p>Doing useful work.</p>'}]},'interview-submission-detail');}],
 ['podcast',()=>showAppSection('podcast')],
 ['podcast-list',()=>{qaMount('landing-podcast-prep');window._podcastPrepSessions=[qaSession];renderPodcastPrepSessions();}],
 ['podcast-detail',()=>{qaMount('landing-podcast-prep');window._podcastPrepSessions=[qaSession];renderPodcastPrepSessions();renderPodcastPrepStaffDetail(qaSession,{q1:{feedback:'Please expand on the example.'}},{q1:[{id:'v1',versionNumber:1,transcript:'Our team learned to listen.',transcriptionStatus:'completed',duration:42}]});}],
 ['podcast-edit',()=>setPodcastPrepSessionEditMode(true)],['podcast-create',()=>{qaMount('landing-podcast-prep-create');window._podcastPrepCreateQuestions=[{id:'q1',question:'What changed?',talkingPoints:'One example.'}];renderPodcastPrepQuestionEditor();}],
 ['community',()=>showAppSection('community')],
 ['writer-profiles',()=>{qaMount('landing-guest-writer-applications');window._guestWriterApplications=[{id:'writer',fullName:'Sample writer',email:'writer@example.test',status:'pending',shortBio:'A thoughtful contributor.'}];renderGuestWriterApplications();openGuestWriterApplication('writer');}],
 ['writer-stories',()=>{qaMount('landing-guest-writer-stories');window._staffGuestWriterStories=[qaStory];renderStaffGuestWriterStories();db=qaReadDb;openStaffGuestWriterStory(qaStory.id,null,{skipFetch:true});}],
 ['tracker',()=>{qaMount('landing-editorial-tracker');renderEditorialTracker();}],
 ['calendar',()=>{qaMount('landing-editorial-calendar');editorialCalendarRender();}],
 ['calendar-form',()=>{qaMount('landing-editorial-calendar-editor');}],
 ['webcomm',()=>showAppSection('webcomm')],['unsent',()=>{qaMount('landing-unsent-admin');window._unsentSubmissions=[{id:'sample',message:'An example reader message',createdAt:new Date().toISOString()}];renderUnsentSubmissions();}],
 ['comments',()=>{qaMount('landing-blog-comments-admin');renderBlogComments();}],['admin',()=>showAppSection('admin')],['canva',()=>{qaMount('landing-admin-dashboard');adminCanvaState.templates=mergeCanvaTemplateConfig(null).map(cloneCanvaTemplate);renderAdminCanvaTemplates();}],
 ['signin',()=>{currentAccessMode='';currentUser=null;showAccessScreen();updateAuthenticatedNavigationForMode();setAuthenticatedShellVisible(false);}],
 ['signup',()=>{loginMode='signup';updateLoginModeUI();}],
 ['forgot-password',()=>{loginMode='signin';updateLoginModeUI();setLoginError('Enter your email address above to reset your password.');}],
 ['auth-error',()=>{setLoginError('This account does not have access. Please use your invited email.');}],
 ['podcast-guest-welcome',()=>{qaMount('podcast-prep-guest-screen','podcast_prep_guest');window._podcastPrepGuest.session=qaSession;window._podcastPrepGuest.responses={};window._podcastPrepGuest.versions={};renderPodcastPrepGuestWelcome();}],
 ['podcast-guest-question',()=>renderPodcastPrepQuestion()],
 ['podcast-guest-saved',()=>{window._podcastPrepGuest.responses={q1:{hasSavedResponse:true,feedback:'Add one example.'}};window._podcastPrepGuest.versions={q1:[{id:'v1',versionNumber:1,transcriptionStatus:'failed',transcript:'',duration:42}]};renderPodcastPrepQuestion();}],
 ['podcast-guest-submit',()=>showPodcastPrepSubmitReview()],
 ['podcast-guest-denied',()=>renderPodcastPrepAccessDenied()],['podcast-guest-verify',()=>renderPodcastPrepVerifyEmail()],['podcast-guest-error',()=>renderPodcastPrepRouteError('We could not open this session. Try again later.')],
 ['writer-onboarding',()=>{qaMount('guest-writer-registration','guest_writer');}],['writer-pending',()=>{qaMount('guest-writer-pending','guest_writer');}],
 ['writer-dashboard',()=>{qaMount('guest-writer-dashboard','guest_writer');window._guestWriterStories=[qaStory];renderGuestWriterDashboardTable();}],
 ['writer-idea',()=>{qaMount('guest-writer-idea','guest_writer');}],['writer-discussion',()=>{qaMount('guest-writer-idea-discussion','guest_writer');document.getElementById('gwi-discussion-summary').textContent='Learning to lead';document.getElementById('gwi-messages').innerHTML=renderIdeaMessage({message:'Please add a personal example.',senderRole:'staff'});}],
 ['writer-editor',()=>{qaMount('landing-scratch','guest_writer');document.getElementById('sc-topic').value=qaStory.title;}],
 ['writer-status',()=>{qaMount('guest-writer-status-screen','guest_writer');showGuestWriterStoryStatus({...qaStory,status:'under_review'});}],
 ['interview-invitation',()=>{qaMount('guest-placeholder','guest');}],
 ['interview-answer',()=>{qaMount('guest-placeholder','guest');renderGuestInterview({interviewTitle:'Work and identity',guestName:'Sample guest',questions:[{id:'q1',question:'What matters most in your work?'}],rawAnswers:[]});}],
 ['interview-review',()=>{renderGuestRefinedReview([{questionId:'q1',question:'What matters most?',refinedAnswerHtml:'<p>Doing work that helps others.</p>'}]);}],
 ['dialog',()=>{qaMount('main');showDraftTypeModal();}],
 ['image-dialog',()=>{closeDraftTypeModal();qaMount('landing-manual-news-review');document.getElementById('news-brief-image-modal').style.display='flex';}],
 ['loading',()=>{document.getElementById('news-brief-image-modal').style.display='none';qaMount('main');document.getElementById('grid').innerHTML='<div class="empty"><div class="spinner"></div>Loading stories...</div>';}],
 ['empty',()=>{qaMount('main');activeTab='newsTracker';newsTrackerCards=[];setCardsForActiveTab([]);}],
];
cases.push(
 ['existing-draft',()=>qaMount('landing-existing-draft')],
 ['social-workflow',()=>qaMount('landing-news-brief-social')],
 ['writer-story-list',()=>qaMount('guest-writer-stories','guest_writer')],
 ['welcome-dialog',()=>{qaMount('guest-writer-dashboard','guest_writer');document.getElementById('gw-welcome-modal').style.display='flex';}],
 ['canva-dialog',()=>{document.getElementById('gw-welcome-modal').style.display='none';qaMount('landing-admin-dashboard');openCanvaInstructionsModal('https://www.canva.com/design/example');}],
 ['recorder',async()=>{
   closeCanvaInstructionsModal();qaMount('podcast-prep-guest-screen','podcast_prep_guest');window._podcastPrepGuest.session=qaSession;renderPodcastPrepQuestion();
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
   window.MediaRecorder=class {static isTypeSupported(){return true} constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['fixture'],{type:'audio/webm'})});this.onstop();}};
   window.AudioContext=class {createAnalyser(){return {frequencyBinCount:128,disconnect(){},getByteFrequencyData(a){a.fill(80)},getByteTimeDomainData(a){a.fill(138)}}}createMediaStreamSource(){return {connect(){},disconnect(){}}}close(){return Promise.resolve()}};
   startPodcastPrepRecording();await new Promise(r=>setTimeout(r,30));clearInterval(window._podcastPrepGuest.timer);
 }],
 ['recorder-playback',()=>stopPodcastPrepRecording()],
 ['recorder-permission-error',()=>{renderPodcastPrepQuestion();document.getElementById('podcast-recording-status').textContent='Microphone permission is required. Allow microphone access in your browser, then try again.';}]
);
const results=[];
async function audit(label){
 await page.evaluate(()=>document.fonts.ready);
 const snaps=[];
 if(label==='image-dialog'){
  assert.equal(await page.locator('#news-brief-image-modal').isVisible(),true,'Image dialog is actually visible');
  assert.equal(await page.evaluate(()=>{const title=document.getElementById('news-brief-image-title'),r=title.getBoundingClientRect();return title.contains(document.elementFromPoint(r.left+2,r.top+2));}),true,'Dialog must paint above the sidebar');
 }
 if(label==='recorder-playback')assert.equal(await page.evaluate(()=>document.getElementById('podcast-waveform').getContext('2d').getImageData(0,0,1,1).data[3]),0,'Stopped waveform background stays transparent');
 for(const theme of ['light','dark','light']){
  await page.evaluate(t=>{if(document.documentElement.dataset.theme!==t)toggleAppTheme();},theme);
  const result=await page.evaluate(()=>{
   const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
   const elems=[...document.querySelectorAll('body *')].filter(visible);
   const theme=document.documentElement.dataset.theme;
   const islands=elems.filter(e=>{if(e.closest('svg')||['IMG','CANVAS','VIDEO','AUDIO'].includes(e.tagName))return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();if(r.width*r.height<500)return false;return theme==='dark'?['rgb(255, 255, 255)','rgb(245, 240, 232)','rgb(246, 243, 237)'].includes(s.backgroundColor):['rgb(17, 17, 17)','rgb(26, 26, 26)','rgb(28, 28, 31)'].includes(s.backgroundColor);}).map(e=>e.id||e.className||e.tagName);
   const blue=elems.filter(e=>e.tagName==='A'&&['rgb(0, 0, 238)','rgb(0, 0, 255)'].includes(getComputedStyle(e).color)).map(e=>e.textContent);
   const workspace=[...document.querySelectorAll('body>.app-workspace')].find(visible);
   return {islands,blue,horizontal:workspace?workspace.scrollWidth>workspace.clientWidth:false,geometry:elems.filter(e=>/^(H1|H2|H3|INPUT|TEXTAREA|BUTTON|SELECT)$/.test(e.tagName)).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return[e.id,e.textContent?.slice(0,35),Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),s.fontFamily,s.fontSize,s.lineHeight,s.display,e.value];}),route:location.href};
  });
  if(result.horizontal)await page.screenshot({path:resolve(out,label+'-overflow.png')});
  assert.deepEqual(result.islands,[],label+' '+theme+' mixed surfaces');assert.deepEqual(result.blue,[],label+' browser-blue links');assert.equal(result.horizontal,false,label+' horizontal overflow');
  snaps.push(result);
  if(snaps.length<3)await page.screenshot({path:resolve(out,label+'-'+theme+'.png')});
 }
 assert.deepEqual(snaps[0].geometry,snaps[1].geometry,label+' Light/Dark geometry/state');assert.deepEqual(snaps[0].geometry,snaps[2].geometry,label+' roundtrip');assert.equal(snaps[0].route,snaps[2].route);
 results.push(label);console.log('PASS '+label);
}
for(const [name,fn]of cases){await page.evaluate('('+fn.toString()+')()');await audit(name);}
// Representative deep responsive screens, mounted through the same actual renderers.
for(const width of [1920,900,390]){
 await page.setViewportSize({width,height:1000});
 for(const name of ['news-brief','podcast-detail','podcast-guest-welcome','podcast-guest-question','writer-onboarding','interview-answer']){
  const fn=cases.find(c=>c[0]===name)[1];await page.evaluate('('+fn.toString()+')()');await audit(name+'-'+width);
 }
}
writeFileSync(resolve(out,'screen-audit.json'),JSON.stringify({passed:results,source,backend:'blocked; isolated fixtures'},null,2));
await browser.close();console.log('PASS all '+results.length+' deep screen/theme roundtrips');
