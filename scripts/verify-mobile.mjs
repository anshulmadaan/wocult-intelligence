// Read-only responsive QA: real renderers, isolated data, and blocked backend requests.
// MOBILE_ENGINE=webkit selects WebKit; MOBILE_LIVE_URL checks deployed static assets.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(pathToFileURL(resolve(process.argv[2]||'tmp/theme-reference-15.24/tooling/node_modules/playwright/index.mjs')));
const out=resolve(process.argv[3]||'tmp/mobile-15.35');mkdirSync(out,{recursive:true});
const source=resolve(process.argv[4]||'.');
const browser=await (process.env.MOBILE_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce',hasTouch:true});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(process.env.MOBILE_LIVE_URL && url.hostname===new URL(process.env.MOBILE_LIVE_URL).hostname)return route.continue();
 if(url.hostname!=='theme.test')return route.fulfill({status:503,body:'{"error":"Read-only fixture"}',contentType:'application/json'});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','idea-board.js','app-navigation.js','app-ui.css','app-ui.js'].includes(name)&&!name.startsWith('assets/fonts/'))return route.fulfill({status:404,body:''});
 return route.fulfill({body:readFileSync(resolve(source,name)),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'}[extname(name)]});
});
await page.goto(process.env.MOBILE_LIVE_URL || 'http://theme.test');await page.waitForFunction(()=>typeof showAppSection==='function');
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
 ['home',()=>{qaMount('landing-cards');showAppSection('home');}],['draft',()=>{qaMount('landing-cards');showAppSection('draft');}],
 ['trending',()=>{qaMount('main');activeTab='newsTracker';newsTrackerCards=[normalizeNewsTrackerCard({dateFound:new Date().toISOString(),headline:'Teams rethink the working week',source:'Example source',link:'https://example.test/story',theme:'Work culture'})];setCardsForActiveTab(newsTrackerCards);}],
 ['news-brief',()=>{qaMount('main');showNewsBriefBriefStep({title:'Teams rethink the working week',link:'https://example.test/story',src:'Example source',ago:'1h ago'});} ],
 ['news-generate',()=>{qaMount('workflow');showWorkflowStep('generate');}],
 ['news-refine',()=>{qaMount('workflow');document.getElementById('step1').style.display='none';document.getElementById('step2').style.display='none';document.getElementById('step3').style.display='none';showWorkflowStep('refine');document.getElementById('chat-article-preview').innerHTML='<h2>Teams rethink the working week</h2><p>Work is changing. This sample copy exercises the existing refinement editor.</p>'; }],
 ['news-review',()=>{qaMount('workflow');document.getElementById('step2b').style.display='none';document.getElementById('step3').style.display='block';}],
 ['url',()=>{qaMount('landing-url');}],['scratch-choice',()=>{qaMount('landing-scratch-choice');}],['scratch',()=>{qaMount('landing-scratch');}],
 ['manual-brief',()=>{qaMount('landing-manual-news-brief');}],['manual-brief-review',()=>{qaMount('landing-manual-news-review');}],['manual-long',()=>{qaMount('landing-manual-long-view');}],['manual-long-review',()=>{qaMount('landing-manual-long-review');}],
 ['automated',()=>{qaMount('landing-automated-news-briefs');renderAutomatedNewsBriefTabs();renderAutomatedNewsBriefList();}],
 ['interviews',()=>{qaMount('landing-cards');showAppSection('interviews');}],['interview-create',()=>{qaMount('landing-prepare-interview');}],
 ['interview-detail',()=>{qaMount('landing-interview-submissions');renderInterviewSubmissionDetail({guestKey:'qa',guestName:'Sample guest',guestEmail:'guest@example.test',interviewTitle:'Work and identity',status:'submitted',questions:[{id:'q1',question:'What matters most in your work?'}],rawAnswers:[{questionId:'q1',answerHtml:'<p>Doing useful work.</p>'}]},'interview-submission-detail');}],
 ['podcast',()=>{qaMount('landing-cards');showAppSection('podcast');}],
 ['podcast-list',()=>{qaMount('landing-podcast-prep');window._podcastPrepSessions=[qaSession];renderPodcastPrepSessions();}],
 ['podcast-detail',()=>{qaMount('landing-podcast-prep');window._podcastPrepSessions=[qaSession];renderPodcastPrepSessions();renderPodcastPrepStaffDetail(qaSession,{q1:{feedback:'Please expand on the example.'}},{q1:[{id:'v1',versionNumber:1,transcript:'Our team learned to listen.',transcriptionStatus:'completed',duration:42}]});}],
 ['podcast-edit',()=>setPodcastPrepSessionEditMode(true)],['podcast-create',()=>{qaMount('landing-podcast-prep-create');window._podcastPrepCreateQuestions=[{id:'q1',question:'What changed?',talkingPoints:'One example.'}];renderPodcastPrepQuestionEditor();}],
 ['community',()=>{qaMount('landing-cards');showAppSection('community');}],
 ['writer-profiles',()=>{qaMount('landing-guest-writer-applications');window._guestWriterApplications=[{id:'writer',fullName:'Sample writer',email:'writer@example.test',status:'pending',shortBio:'A thoughtful contributor.'}];renderGuestWriterApplications();openGuestWriterApplication('writer');}],
 ['writer-stories',()=>{qaMount('landing-guest-writer-stories');window._staffGuestWriterStories=[qaStory];renderStaffGuestWriterStories();db=qaReadDb;openStaffGuestWriterStory(qaStory.id,null,{skipFetch:true});}],
 ['tracker',()=>{qaMount('landing-editorial-tracker');renderEditorialTracker();}],
 ['calendar',()=>{qaMount('landing-editorial-calendar');editorialCalendarRender();}],
 ['calendar-form',()=>{qaMount('landing-editorial-calendar-editor');}],
 ['webcomm',()=>{qaMount('landing-cards');showAppSection('webcomm');}],['unsent',()=>{qaMount('landing-unsent-admin');window._unsentSubmissions=[{id:'sample',message:'An example reader message',createdAt:new Date().toISOString()}];renderUnsentSubmissions();}],
 ['comments',()=>{qaMount('landing-blog-comments-admin');window._blogComments=Array.from({length:12},(_,i)=>({id:'c'+i,post:'historical-post',name:'Reader '+i,message:'A comment with a long URL https://example.test/'+ 'long'.repeat(30),createdAt:new Date(2025,0,i+1).toISOString()}));renderBlogComments();}],['admin',()=>{qaMount('landing-cards');showAppSection('admin');}],['canva',()=>{qaMount('landing-admin-dashboard');adminCanvaState.templates=mergeCanvaTemplateConfig(null).map(cloneCanvaTemplate);renderAdminCanvaTemplates();}],
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

async function resize(size){await page.setViewportSize(size);await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));}
const results=[];
let checks=0;
const sizes=[[320,568],[360,800],[375,667],[390,844],[393,852],[412,915],[430,932],[768,1024],[820,1180],[1024,1366],[1366,768],[1440,900],[1920,1080],[844,390]];
for(const [width,height] of (process.env.MOBILE_INTERACTIONS_ONLY?[]:sizes)){
 await resize({width,height});
 for(const [name,fn] of cases){
  if(['signup','forgot-password','auth-error','recorder','recorder-playback','recorder-permission-error'].includes(name))continue;
  await page.evaluate(()=>{document.querySelectorAll('.news-image-modal,.editorial-more-modal,[id$="-modal"],#editorial-tracker-overlay').forEach(e=>e.style.display='none');document.querySelectorAll('dialog[open]').forEach(e=>e.close());document.getElementById('workflow').classList.remove('app-refining');});
  try{await page.evaluate('('+fn.toString()+')()');}catch(e){results.push({width,height,name,error:e.message});continue;}
  await page.evaluate(()=>document.fonts.ready);
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const r=await page.evaluate(()=>{
    const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const ws=[...document.querySelectorAll('body>.app-workspace')].find(visible);
    const overflow=[...document.querySelectorAll('body *')].filter(e=>{if(!visible(e)||e.closest('.app-sidebar,svg,table,#editorial-calendar-grid,.wf-steps'))return false; const r=e.getBoundingClientRect();let p=e.parentElement;while(p&&p!==ws){if(['auto','scroll'].includes(getComputedStyle(p).overflowX))return false;p=p.parentElement;}return r.width>0&&(r.right>innerWidth+1||r.left < -1);}).map(e=>e.id||e.className||e.tagName);
    return {documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,workspaceOverflow:ws?ws.scrollWidth>ws.clientWidth+1:false,overflow:[...new Set(overflow)]};
   });
   const reach=await page.evaluate(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';const ws=[...document.querySelectorAll('body>.app-workspace')].find(visible);if(!ws)return true;const scroller=ws.classList.contains('app-refining')?document.getElementById('refine-content'):ws;scroller.scrollTop=scroller.scrollHeight;const ok=scroller.scrollHeight<=scroller.clientHeight+1||scroller.scrollTop>0;scroller.scrollTop=0;return ok;});
   if(!reach)results.push({width,height,name,theme,error:'workspace cannot scroll to bottom'});
   checks++;
   if([360,390,430,768,1366,1920].includes(width) && ['home','draft','podcast-detail','writer-profiles','comments','news-refine','calendar-form','image-dialog','canva','interviews','community','tracker','webcomm'].includes(name))await page.screenshot({path:resolve(out,name+'-'+width+'-'+theme+'.png')});
   if(r.documentOverflow||r.workspaceOverflow||r.overflow.length)results.push({width,height,name,theme,...r});
  }
 }
 console.log('AUDITED '+width+'x'+height);
}
writeFileSync(resolve(out,'layout-results.json'),JSON.stringify(results,null,2));
console.log('Layout checks: '+checks+'; issues: '+results.length);

const mount=async name=>{await page.evaluate(()=>{qaMount('landing-cards');document.querySelectorAll('.news-image-modal,.editorial-more-modal,[id$="-modal"],#editorial-tracker-overlay').forEach(e=>e.style.display='none');});await page.evaluate('('+cases.find(c=>c[0]===name)[1].toString()+')()');};
for(const width of [320,360,390,430,768]){
 await resize({width,height:844});await mount('home');
 await page.locator('#app-menu-toggle').click();assert(await page.locator('body').evaluate(e=>e.classList.contains('app-drawer-open')));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#app-sidebar-backdrop').isVisible(),false);
 await page.locator('#app-menu-toggle').click();await page.locator('#app-sidebar-backdrop').click({position:{x:width-12,y:400}});assert.equal(await page.locator('#app-sidebar-backdrop').isVisible(),false);
 await page.locator('#app-menu-toggle').click();await page.locator('[data-section="draft"]').click();assert.equal(await page.locator('#app-sidebar-backdrop').isVisible(),false);
 assert.equal(await page.locator('.app-launcher-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),width<=600?1:2);
 await mount('writer-profiles');assert.equal(await page.locator('.app-detail-layout:visible').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1);
 await mount('comments');const table=page.locator('#blog-comments-list');assert(await table.evaluate(e=>e.scrollWidth>e.clientWidth));
 await table.evaluate(e=>e.scrollLeft=e.scrollWidth);assert(await table.evaluate(e=>e.scrollLeft>0));
 await page.locator('#blog-comments-search').fill('Reader 1');assert.match(await page.locator('#blog-comments-status').textContent(),/3 of 12/);
 await page.locator('#blog-comments-search').fill('');await page.locator('#blog-comments-sort').selectOption('oldest');
 await page.evaluate(()=>editBlogComment('historical-post','c0'));
 const input=page.locator('#blog-comments-list textarea');await input.fill('Local fixture edit');
 await resize({width,height:420});await input.scrollIntoViewIfNeeded();assert((await input.boundingBox()).height>0);
 await resize({width,height:844});await page.locator('#blog-comments-list').getByRole('button',{name:'Cancel',exact:true}).click();
 for(const name of ['draft','podcast-create','writer-profiles','calendar-form','news-refine']){
  await mount(name);
  const ws=page.locator('body>.app-workspace:visible');
  const scroller=name==='news-refine'?page.locator('#refine-content'):ws;
  await scroller.evaluate(e=>e.scrollTop=e.scrollHeight);assert(await scroller.evaluate(e=>e.scrollHeight<=e.clientHeight+1||e.scrollTop>0),name+' scrolls');
  const control=ws.locator('input:visible:not([type=checkbox]),textarea:visible,[contenteditable=true]:visible').first();
  if(await control.count()){await control.focus();await resize({width,height:420});await control.scrollIntoViewIfNeeded();assert(await control.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));await resize({width,height:844});await control.blur();}
 }
 for(const id of ['draft-type-modal','gw-welcome-modal','news-brief-social-modal','canva-instructions-modal','editorial-tracker-overlay','news-brief-image-modal']){
  await mount(id==='editorial-tracker-overlay'?'tracker':'home');await page.evaluate(id=>document.getElementById(id).style.display='flex',id);
  await resize({width,height:420});
  const panel=page.locator('#'+id+'>div').first();const box=await panel.boundingBox();assert(box&&box.y>=-1&&box.y+box.height<=421,id+' bounded '+JSON.stringify(box));
  await panel.evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.evaluate(id=>document.getElementById(id).style.display='none',id);await resize({width,height:844});
 }
 await mount('home');await page.evaluate(()=>{document.getElementById('notifications-list').innerHTML='<p>Notification</p>'.repeat(40);toggleNotificationsPanel(true);});
 const notifications=await page.locator('#notifications-panel').boundingBox();assert(notifications.x>=0&&notifications.x+notifications.width<=width);
 await page.locator('#notifications-panel').getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.locator('#notifications-panel').isVisible(),false);
}
await resize({width:390,height:844});await mount('home');await page.locator('#app-menu-toggle').click();
await resize({width:844,height:390});assert.equal(await page.locator('#app-sidebar-backdrop').isVisible(),false);assert.equal(await page.locator('#app-sidebar').evaluate(e=>e.getBoundingClientRect().left),0);
await resize({width:390,height:844});assert.equal(await page.locator('#app-sidebar-backdrop').isVisible(),false);await page.locator('#app-menu-toggle').click();await page.keyboard.press('Escape');
if(process.env.MOBILE_ENGINE!=='webkit'){
 await mount('comments');const ws=page.locator('body>.app-workspace:visible');await ws.evaluate(e=>e.scrollTop=0);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:700}]});
 for(let y=680;y>=200;y-=30){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});await new Promise(r=>setTimeout(r,16));}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>document.querySelector('body>.app-workspace:not([style*="display: none"])')?.scrollTop>0 || [...document.querySelectorAll('body>.app-workspace')].some(e=>e.scrollTop>0));
 assert(await ws.evaluate(e=>e.scrollTop>0),'touch drag scrolls workspace through horizontal table region');
 await mount('news-refine');await page.evaluate(()=>{document.getElementById('chat-article-preview').innerHTML='<p>Touch scroll boundary regression.</p>'.repeat(90);document.getElementById('chat-messages').innerHTML='<div>AI response for scroll regression.</div>'.repeat(20);const e=document.getElementById('chat-article-preview');e.scrollTop=e.scrollHeight;document.getElementById('refine-content').scrollTop=0;});
 const editorBox=await page.locator('#chat-article-preview').boundingBox();const startY=Math.min(editorBox.y+editorBox.height-15,780);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:startY}]});
 for(let delta=20;delta<=180;delta+=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:startY-delta}]});await new Promise(r=>setTimeout(r,16));}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>document.getElementById('refine-content').scrollTop>0);
 await cdp.detach();
}
console.log('PASS drawer, breakpoints, tables, search/sort, input focus, resized viewport recovery, dialogs, notifications and orientation');
await browser.close();
if(!process.env.MOBILE_AUDIT_ONLY)assert.deepEqual(results,[]);
