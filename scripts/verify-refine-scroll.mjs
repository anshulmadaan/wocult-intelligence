import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(resolve(process.argv[2]||'tmp/theme-reference-15.24/tooling/node_modules/playwright/index.mjs')));
const out=resolve(process.argv[3]||'tmp/refine-15.29/qa');mkdirSync(out,{recursive:true});
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

const results=[];
for(const [width,height] of [[1920,1080],[1920,900],[1440,900],[1366,768],[1100,650],[820,900],[390,844]]){
 await page.setViewportSize({width,height});
 for(const theme of ['light','dark']){
 await page.evaluate(theme=>{
  currentUser={uid:'qa',email:ADMIN_EMAIL};currentAccessMode='staff';hideAllAppScreens();
  document.getElementById('workflow').style.display='block';showWorkflowStep('refine');
  if(document.documentElement.getAttribute('data-theme')!==theme)toggleAppTheme();
  document.getElementById('chat-article-preview').innerHTML='<p>Sample story text for independent article scrolling.</p>'.repeat(90);
  document.getElementById('chat-messages').innerHTML='<div>Wocult AI: Your draft is ready to refine.</div>'.repeat(20);
 },theme);
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>document.activeElement?.blur());
 await page.mouse.move(0,0);
 const scrollbar=()=>page.locator('#refine-content').evaluate(e=>{
  const thumb=getComputedStyle(e,'::-webkit-scrollbar-thumb');
  return {width:getComputedStyle(e,'::-webkit-scrollbar').width,color:thumb.backgroundColor,border:thumb.borderLeftWidth,clip:thumb.backgroundClip,track:getComputedStyle(e,'::-webkit-scrollbar-track').backgroundColor,editor:getComputedStyle(document.getElementById('chat-article-preview')).scrollbarColor};
 });
 const rest=await scrollbar();
 assert.equal(rest.width,'8px');assert.equal(rest.border,'2px');assert.equal(rest.clip,'padding-box');assert.equal(rest.track,'rgba(0, 0, 0, 0)');assert.equal(rest.editor,'auto');
 assert.equal(rest.color,theme==='light'?'rgba(46, 46, 48, 0.22)':'rgba(245, 243, 238, 0.18)');
 await page.locator('#refine-content').hover();
 const activeColor=theme==='light'?'rgba(46, 46, 48, 0.4)':'rgba(245, 243, 238, 0.34)';
 assert.equal((await scrollbar()).color,activeColor);
 await page.mouse.move(0,0);await page.locator('#chat-article-preview').focus();
 assert.equal((await scrollbar()).color,activeColor);
 await page.evaluate(()=>document.activeElement.blur());
 await page.locator('#refine-content').evaluate(e=>e.scrollTop=0);
 const initial=await page.evaluate(()=>{
  const ids=['workflow','refine-header','refine-content','chat-article-preview'];
  return Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return[id,{top:r.top,bottom:r.bottom,client:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}]}));
 });
 assert.equal(initial['refine-content'].overflow,'auto');
 assert.equal(initial['chat-article-preview'].overflow,'auto');
 assert(initial['chat-article-preview'].scroll>initial['chat-article-preview'].client);
 assert(initial.workflow.bottom<=height+1);
 if(height<=900)assert(initial['refine-content'].scroll>initial['refine-content'].client,'outer overflow at short viewport');
 await page.locator('#refine-content').evaluate(e=>e.scrollTop=e.scrollHeight);
 const bottom=await page.evaluate(()=>{
  const outer=document.getElementById('refine-content'),composer=document.querySelector('.refine-composer').getBoundingClientRect();
  return {top:composer.top,bottom:composer.bottom,outerTop:outer.getBoundingClientRect().top,header:document.getElementById('refine-header').getBoundingClientRect().top,body:document.documentElement.scrollHeight,viewport:innerHeight,width:document.documentElement.scrollWidth};
 });
 assert(bottom.bottom<=height && bottom.top>=bottom.outerTop,'composer fully reachable');
 assert.equal(bottom.header,initial['refine-header'].top);
 assert(bottom.body<=height && bottom.width<=width,'no page overflow');
 await page.screenshot({path:resolve(out,`${width}-${height}-${theme}.png`)});
 await page.locator('#refine-content').evaluate(e=>e.scrollTop=0);
 await page.locator('#chat-article-preview').evaluate(e=>e.scrollTop=200);
 assert.equal(await page.locator('#refine-content').evaluate(e=>e.scrollTop),0);
 assert.equal(await page.locator('#chat-article-preview').evaluate(e=>e.scrollTop),200);
 await page.locator('#chat-article-preview').focus();await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement.id)==='chat-messages')await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'chat-input');
 const focus=await page.locator('#chat-input').boundingBox();assert(focus.y>=initial['refine-content'].top && focus.y+focus.height<=height);
 await page.evaluate(()=>showWorkflowStep('brief'));
 assert.equal(await page.locator('#workflow').evaluate(e=>getComputedStyle(e).overflowY),'auto');
 await page.evaluate(()=>{showWorkflowStep('refine');hideAllAppScreens();});
 assert.equal(await page.locator('#workflow').evaluate(e=>getComputedStyle(e).display),'none');
 if(theme==='dark')assert.deepEqual(initial,results.at(-1).initial,'theme geometry stays identical');
 results.push({width,height,theme,initial,bottom});
 }
}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));
console.log(`Passed ${results.length} Refine layout/theme cases, editor isolation, keyboard composer access and workflow exit.`);
await browser.close();
