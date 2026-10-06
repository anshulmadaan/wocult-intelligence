import {createHash} from 'node:crypto';
import {buildDraftPrompt} from '../src/newsBriefAutomation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function generateNewsBrief(');
const block=html.slice(start,html.indexOf('\nfunction ',start+1));
function request(card={},instructions){
 let captured;
 const context={window:{},document:{getElementById:()=>null},setInterval:()=>1,clearInterval(){},WORKER:'https://worker.example.test',fetch:(url,options)=>{captured={url,...JSON.parse(options.body)};return new Promise(()=>{});}};
 vm.createContext(context);vm.runInContext(block,context);context.generateNewsBrief(card,instructions);return captured;
}
const paragraphs={
  "WOCULT AUDIENCE": "- WOCULT AUDIENCE: Wocult is built for people navigating work in India, including employees, managers, jobseekers, independent professionals and business leaders. Choose editorial angles that reveal a meaningful consequence for careers, hiring, skills, pay, management, workplace culture, job security, policy or power at work. Use this audience context to decide the angle. Do not mechanically mention \"working professionals\", \"Indian professionals\" or \"employees\" in the standfirst unless the wording is natural and necessary.",
  "STANDFIRST PURPOSE": "- STANDFIRST PURPOSE: The headline states what happened. The standfirst must add the strongest distinct implication, tension, shift or consequence supported by the story. It must not restate, expand or paraphrase the headline. Use Wocult's audience context to select the angle, but do not explicitly explain that it is \"what this means for working professionals\".",
  "STANDFIRST RULES": "- STANDFIRST RULES: Write 140 to 200 characters. Carry a distinct angle not already expressed by the headline. When supported by the evidence, relate the angle to careers, hiring, skills, pay, management, workplace culture, job security, policy, labour markets or power at work. Do not repeat, expand or paraphrase the headline. Do not use a generic explanation that the story matters to working professionals. Include the company, number or place only when needed to make the angle clear. Do not repeat these details merely because they appear in the headline. Do not begin with a generic phrase such as \"The development comes as\". Do not use promotional language. Do not speculate beyond the available evidence. Hand off cleanly to the body without duplicating the opening paragraph. Use sentence case while preserving proper nouns and acronyms exactly. Choose an angle that is relevant to Wocult's audience without explicitly naming the audience unless it is natural and necessary."
};
test('interactive request preserves configuration, interpolation and defaults',()=>{
 const r=request({link:'https://publisher.example/story',title:'Example headline',src:'Starting publication'},{headlineAngle:'Hiring',editorNotes:'Verify the filing'});
 assert.equal(r.url,'https://worker.example.test/generate');
 assert.equal(r.briefType,'news_brief');assert.equal(r.model,'claude-sonnet-4-6');assert.equal(r.max_tokens,1400);
 assert.deepEqual(r.tools,[{type:'web_search_20250305',name:'web_search'}]);
 const p=r.messages[0].content;
 assert(p.includes('Starting article URL:\nhttps://publisher.example/story'));
 assert(p.includes('Headline: Example headline\nStarting publisher: Starting publication'));
 assert(p.includes('Suggested headline angle:\nHiring'));assert(p.includes('Verify the filing'));
 const fallback=request().messages[0].content;assert(fallback.includes('No specific headline angle provided.'));assert(fallback.includes('No additional editor instructions provided.'));
});
test('interactive sourcing distinguishes discovery, primary sources and original reporting',()=>{
 const p=request().messages[0].content;
 for(const rule of [
 'Treat the supplied article as the starting point, not automatically as the original source.',
 'Prefer the original or primary source where available',
 'Use web search only when needed to locate or confirm that source.',
 'Do not conduct broad background research unless necessary to verify a material fact.',
 'If no reliable primary source can be found, use the starting article as the reporting source.',
 'Never imply that Wocult independently obtained information, a statement or a quotation that came from another publication.',
 "When a material fact relies on another publication's reporting, attribute that publication naturally where the information is used.",
 'Do not force attribution into the first or second paragraph.',
 'The company told Reuters...',
 'In a statement to The Economic Times...',
 'If a quote or statement comes from an official filing, release, court document, public statement or other primary source, attribute that primary source instead.',
 'Do not reproduce a quotation unless its wording and source are verified.',
 'Set sourceName and sourceUrl to the best verified original or primary source where one exists.',
 'If no reliable primary source is available, use the publication and URL whose reporting the story relies on.'
 ])assert(p.includes(rule),rule);
 assert.equal(p.split('SOURCE AND ATTRIBUTION').length-1,1);
 assert(!p.includes('Use the source URL as the factual basis.'));
});
test('full audience and standfirst paragraphs survive exactly once without interactive examples',()=>{
 const p=request().messages[0].content;
 for(const [label,paragraph] of Object.entries(paragraphs)){assert(p.includes(paragraph),label);assert.equal(p.split(label+':').length-1,1);}
 for(const rule of ['Explain why this matters to working professionals.','Use British English.','Body should be 200-350 words.','Body must be valid HTML paragraphs only.'])assert(p.includes(rule));
 assert.doesNotMatch(p,/JPMorgan|Positive standfirst example|Negative standfirst example/);
 const schema=JSON.parse(p.split('Return JSON only:\n')[1].split('\n\nImportant:')[0]);
 assert.deepEqual(Object.keys(schema),['title','slug','standfirst','body','seoDescription','sourceName','sourceUrl','beat','publishedDate']);
 assert.match(block,/repairGeneratedJsonOnce/);assert.match(block,/finalizeGeneratedNewsBrief/);
});

test('automated buildDraftPrompt remains byte-for-byte equivalent to the pre-release function',()=>{
 const digest=createHash('sha256').update(buildDraftPrompt.toString().replace(/\r\n/g,'\n')).digest('hex');
 assert.equal(digest,'727e5057559113b106c7c00bf1fc67d4990b91eec73d8dea01d742de613813cd');
});
