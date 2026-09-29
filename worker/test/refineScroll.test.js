import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
test('Refine uses shell-bounded flex layout with independent content and editor scrolling',()=>{
 assert.match(html,/#workflow\.app-refining\{[^}]*flex-direction:column/);
 assert.match(html,/#step2b\{[^}]*min-height:0[^}]*flex:1 1 0/);
 assert.match(html,/#refine-content\{[^}]*min-height:0[^}]*overflow-y:auto/);
 assert.match(html,/#step2b #chat-article-preview\{[^}]*flex:0 0 auto[^}]*overflow-y:auto/);
 assert.doesNotMatch(html,/#step2b\{[^}]*100vh/);
});
test('Refine controls remain outside scroll content and composer stays in normal flow',()=>{
 const start=html.indexOf('<div id="step2b"');const end=html.indexOf('<div id="step3"',start);const refine=html.slice(start,end);
 assert(refine.indexOf('id="refine-header"')<refine.indexOf('id="refine-content"'));
 assert(refine.indexOf('id="chat-messages"')>refine.indexOf('id="refine-content"'));
 assert.match(refine,/class="app-panel-surface refine-composer"/);
 assert.doesNotMatch(refine,/bottom:0/);
 for(const handler of ['updateDraft()','revertDraftUpdate()','proceedToReview()','sendChatMessage()','updateWordCount()'])assert(refine.includes(handler));
 assert.match(html,/#step2b #chat-messages\{[^}]*max-height:126px;overflow-y:auto/);
});
