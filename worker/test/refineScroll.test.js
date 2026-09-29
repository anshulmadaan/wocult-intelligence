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

test('outer Refine scrollbar is subtle, theme-aware and leaves inner scrollbars native',()=>{
 const css=readFileSync(new URL('../../app-ui.css',import.meta.url),'utf8');
 assert.match(css,/#refine-content\{[^}]*scrollbar-width:thin;scrollbar-color:var\(--refine-scrollbar-current\) transparent/);
 assert.match(css,/#refine-content>\*\{scrollbar-color:auto\}/);
 assert.match(css,/#refine-content::-webkit-scrollbar\{width:8px/);
 assert.match(css,/#refine-content::-webkit-scrollbar-thumb\{[^}]*border:2px solid transparent;background-clip:padding-box;border-radius:999px/);
 assert.match(css,/#refine-content:hover,#refine-content:focus-within/);
 assert.match(css,/--refine-scrollbar-thumb:rgba\(46,46,48,\.22\)/);
 assert.match(css,/--refine-scrollbar-thumb:rgba\(245,243,238,\.18\)/);
 assert.doesNotMatch(css,/scrollbar-width:none/);
});
