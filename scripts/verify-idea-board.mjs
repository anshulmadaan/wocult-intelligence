import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(resolve(process.argv[2]||'tmp/theme-reference-15.24/tooling/node_modules/playwright/index.mjs')));
const out=resolve(process.argv[3]||'tmp/ideas-15.32/browser');mkdirSync(out,{recursive:true});
const source=resolve(process.argv[4]||'.');
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='theme.test')return route.fulfill({status:503,body:'{"error":"Read-only fixture"}',contentType:'application/json'});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','idea-board.js','app-navigation.js','app-ui.css','app-ui.js'].includes(name)&&!name.startsWith('assets/fonts/'))return route.fulfill({status:404,body:''});
 return route.fulfill({body:readFileSync(resolve(source,name)),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'}[extname(name)]});
});
await page.goto('http://theme.test');await page.waitForFunction(()=>typeof showAppSection==='function');


await page.evaluate(()=>{
 const records=new Map(),listeners=new Set();let id=0,tick=0;
 window.ideaFixture={records,listeners,fail:false};
 const stamp=()=>{const time=1791360000000+(++tick)*1000;return {toDate:()=>new Date(time)};};
 window.firebase={firestore:{FieldValue:{serverTimestamp:stamp}}};
 function snapshot(path,field,direction,limit){let rows=[...records.entries()].filter(([key])=>key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value,ref:documentRef(key)}));if(field)rows.sort((a,b)=>(a.data()[field].toDate()-b.data()[field].toDate())*(direction==='desc'?-1:1));if(limit)rows=rows.slice(0,limit);return {docs:rows,empty:!rows.length};}
 function emit(){listeners.forEach(l=>l.cb(snapshot(l.path,l.field,l.direction,l.limit)));}
 function check(){if(ideaFixture.fail)throw Error('Fixture write failure');}
 function documentRef(path){return {id:path.split('/').at(-1),collection:n=>query(path+'/'+n),update:async data=>{check();records.set(path,{...records.get(path),...data});emit();},delete:async()=>{check();records.delete(path);emit();}};}
 function query(path,field,direction,limit){return {doc:id=>documentRef(path+'/'+id),orderBy:(f,d)=>query(path,f,d,limit),limit:n=>query(path,field,direction,n),get:async()=>snapshot(path,field,direction,limit),add:async data=>{check();records.set(path+'/'+(++id),data);emit();return {id:String(id)};},onSnapshot:(cb,error)=>{const l={path,field,direction,limit,cb,error};listeners.add(l);if(ideaFixture.readFail)error(Error('Fixture read failure'));else if(!ideaFixture.loading)cb(snapshot(path,field,direction,limit));return ()=>listeners.delete(l);}};}
 db={collection:n=>query(n),batch:()=>{const refs=[];return {delete:r=>refs.push(r),commit:async()=>{if(ideaFixture.cleanupFail)throw Error('Fixture cleanup failure');for(const ref of refs)await ref.delete();}}}};
 window.mountIdeasAs=(uid,email,mode='staff')=>{hideAllAppScreens();currentUser={uid,email,displayName:uid};currentAccessMode=mode;showAppSection('ideas');renderAppShell();};
 mountIdeasAs('Creator','poorvi.arya23@gmail.com');
});
assert.deepEqual((await page.locator('#app-nav .app-nav-item').allTextContents()).slice(0,3),['Home','Idea board','Draft new stories']);
assert(await page.getByText('Capture the ideas worth coming back to.').isVisible());
await page.evaluate(()=>{ideaFixture.loading=true;mountIdeasAs('Creator','poorvi.arya23@gmail.com');});
assert(await page.getByText('Loading ideas…',{exact:true}).isVisible());
await page.evaluate(()=>{ideaFixture.loading=false;ideaFixture.readFail=true;mountIdeasAs('Creator','poorvi.arya23@gmail.com');});
assert(await page.getByText('Failed to load ideas. Open Idea board again to retry.').isVisible());
await page.evaluate(()=>{ideaFixture.readFail=false;mountIdeasAs('Creator','poorvi.arya23@gmail.com');});
await page.getByRole('button',{name:'+ New idea',exact:true}).click();
for(const id of ['idea-title','idea-description-input','idea-priority-input'])assert(await page.locator('#'+id).getAttribute('required')!==null);
assert.equal(await page.locator('#idea-priority-input').inputValue(),'');
await page.getByRole('button',{name:'Save idea',exact:true}).click();assert(await page.locator('dialog').isVisible());
await page.locator('#idea-title').fill('A shared editorial idea');await page.locator('#idea-description-input').fill('Consider a recurring series about work.');await page.locator('#idea-priority-input').selectOption('high');
await page.evaluate(()=>ideaFixture.fail=true);await page.getByRole('button',{name:'Save idea',exact:true}).click();assert(await page.getByText('Failed to save idea. Please try again.').isVisible());
await page.evaluate(()=>ideaFixture.fail=false);await page.getByRole('button',{name:'Save idea',exact:true}).click();await page.waitForSelector('dialog',{state:'detached'});
assert.equal(await page.locator('.idea-card').count(),1);assert.match(await page.locator('.idea-card').textContent(),/High priority.*Added by Creator/);
await page.locator('.idea-card').focus();await page.keyboard.press('Enter');assert(await page.getByRole('button',{name:'Edit idea',exact:true}).isVisible());assert.equal(await page.getByRole('button',{name:'Delete idea',exact:true}).count(),0);
await page.getByRole('button',{name:'Edit idea',exact:true}).click();await page.locator('#idea-title').fill('Updated idea');
await page.evaluate(()=>ideaFixture.fail=true);await page.getByRole('button',{name:'Save changes',exact:true}).click();assert(await page.getByText('Failed to update idea. Please try again.').isVisible());
await page.evaluate(()=>ideaFixture.fail=false);await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForSelector('dialog',{state:'detached'});
await page.evaluate(()=>mountIdeasAs('Colleague','divya.madaan@gmail.com'));await page.locator('.idea-card').click();
assert.equal(await page.getByRole('button',{name:'Edit idea',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Delete idea',exact:true}).count(),0);
await page.locator('#idea-comment').fill('Useful idea. Let us discuss the evidence.');
await page.evaluate(()=>ideaFixture.fail=true);await page.getByRole('button',{name:'Post comment',exact:true}).click();assert(await page.getByText('Failed to post comment. Please try again.').isVisible());assert.equal(await page.locator('#idea-comment').inputValue(),'Useful idea. Let us discuss the evidence.');
await page.evaluate(()=>ideaFixture.fail=false);await page.getByRole('button',{name:'Post comment',exact:true}).click();await page.waitForSelector('.idea-comment');assert.match(await page.locator('.idea-comment').textContent(),/Colleague/);
await page.evaluate(()=>{for(const l of ideaFixture.listeners)if(l.path.includes('/comments'))l.error(Error('Fixture read failure'));});assert(await page.getByText('Failed to load comments. Reopen this idea to retry.').isVisible());
await page.keyboard.press('Escape');await page.evaluate(()=>mountIdeasAs('Creator','poorvi.arya23@gmail.com'));await page.locator('.idea-card').click();assert.match(await page.locator('.idea-comment').textContent(),/Colleague/);await page.keyboard.press('Escape');
await page.getByRole('button',{name:'+ New idea',exact:true}).click();await page.locator('#idea-title').fill('Newest idea');await page.locator('#idea-description-input').fill('Keep this for the next editorial discussion.');await page.locator('#idea-priority-input').selectOption('low');await page.getByRole('button',{name:'Save idea',exact:true}).click();await page.waitForSelector('dialog',{state:'detached'});assert.match(await page.locator('.idea-card').first().textContent(),/Newest idea/);
for(const width of [1920,1440,820,390]){
 await page.setViewportSize({width,height:900});
 for(const theme of ['light','dark']){
  await page.evaluate(t=>{if(document.documentElement.dataset.theme!==t)toggleAppTheme();},theme);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const columns=await page.locator('.idea-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(columns,width>1200?3:width>600?2:1);
  await page.screenshot({path:resolve(out,`board-${width}-${theme}.png`)});
  await page.locator('.idea-card').first().click();assert(await page.locator('#idea-comment').isVisible());
  assert(await page.locator('dialog').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
  await page.screenshot({path:resolve(out,`detail-${width}-${theme}.png`)});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'+ New idea',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'idea-title');await page.screenshot({path:resolve(out,`create-${width}-${theme}.png`)});await page.keyboard.press('Escape');
 }
}
await page.evaluate(()=>mountIdeasAs('Admin','anmadaan@gmail.com'));await page.locator('.idea-card').filter({hasText:'Updated idea'}).click();
assert(await page.getByRole('button',{name:'Edit idea',exact:true}).isVisible());await page.getByRole('button',{name:'Edit idea',exact:true}).click();await page.locator('#idea-priority-input').selectOption('medium');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForSelector('dialog',{state:'detached'});
assert(await page.evaluate(()=>[...ideaFixture.records.values()].find(i=>i.title==='Updated idea').createdByUid==='Creator'));
await page.locator('.idea-card').filter({hasText:'Updated idea'}).click();await page.getByRole('button',{name:'Delete idea',exact:true}).click();assert(await page.getByText('This permanently removes the idea and its comments.').isVisible());
await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.idea-card').count(),2);
await page.locator('.idea-card').filter({hasText:'Updated idea'}).click();await page.getByRole('button',{name:'Delete idea',exact:true}).click();
await page.evaluate(()=>ideaFixture.fail=true);await page.getByRole('button',{name:'Delete idea',exact:true}).click();assert(await page.getByText('Failed to delete idea. Please try again.').isVisible());
await page.evaluate(()=>{ideaFixture.fail=false;ideaFixture.cleanupFail=true;});await page.getByRole('button',{name:'Delete idea',exact:true}).click();assert(await page.getByText('Idea removed, but comment cleanup failed. Select Delete idea to retry cleanup.').isVisible());
await page.evaluate(()=>ideaFixture.cleanupFail=false);await page.getByRole('button',{name:'Delete idea',exact:true}).click();await page.waitForSelector('dialog',{state:'detached'});
assert.equal(await page.evaluate(()=>[...ideaFixture.records.keys()].filter(k=>k.includes('/comments/')).length),0);
for(const mode of ['guest_writer','podcast_prep_guest','guest','']){
 await page.evaluate(m=>{hideAllAppScreens();currentUser={uid:'guest',email:'guest@example.test'};currentAccessMode=m;renderAppShell();showAppSection('ideas');},mode);
 assert.equal(await page.locator('#app-nav [data-section="ideas"]').count(),0);
 assert.equal(await page.evaluate(()=>ideaFixture.listeners.size),0);
}
console.log('PASS: Idea board roles, forms, validation/failure recovery, cards, discussions, ownership, admin delete, eight theme/viewport cases, focus and listener teardown.');
await browser.close();
