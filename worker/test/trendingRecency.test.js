import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function block(name){
  const start=html.indexOf('function '+name+'(');
  const end=html.indexOf('\nfunction ',start+1);
  return html.slice(start,end<0?undefined:end);
}
const now=Date.parse('2026-09-25T12:00:00Z'), hour=3600000;
function setup(){
  const logs=[],grid={innerHTML:'',style:{}};
  const c=vm.createContext({console:{info:m=>logs.push(m),warn:()=>{}},Date,Number,Promise,activeTab:'newsTracker',newsTrackerCards:[],newsTrackerLoaded:false,cards:[],NEWS_TRACKER_API:'https://existing.test/feed',document:{getElementById:()=>grid},render:()=>{},updateStats:()=>{},strip:v=>v,ago:()=>'',newsTrackerHeat:()=>8,mapNewsTrackerThemeToCardCat:()=> 'general'});
  for(const name of ['trendingTimestamp','recentTrendingCards','normalizeNewsTrackerCard','setCardsForActiveTab','loadNewsTracker','openDraft','chooseDraftType']) vm.runInContext(block(name),c);
  return {c,logs,grid};
}
const row=(hours,id=hours)=>({dateFound:new Date(now-hours*hour).toISOString(),headline:'Story '+id,link:'https://source.test/'+id,owner:'untouched',extra:{retained:true}});
for(const hours of [1,24,71,72]) test('includes record '+hours+' hours old including exact cutoff',()=>{
  const {c}=setup(),record=row(hours);assert.equal(c.recentTrendingCards([record],now)[0],record);
});
test('excludes just beyond cutoff, missing, malformed and impossible dates',()=>{
  const {c,logs}=setup();
  const records=[row(72+1/hour),{}, {dateFound:''},{dateFound:'not a date'},{dateFound:'31/09/2026 12:00'},{dateFound:'2026-02-30T12:00:00Z'},{dateFound:'25/09/2026 garbage'}];
  assert.equal(c.recentTrendingCards(records,now).length,0);
  assert.equal(logs[0],'Trending records loaded: 7; Within 72 hours: 0; Excluded because old: 1; Excluded because invalid date: 6');
});
test('sorts newest first without mutating rows or source order',()=>{
  const {c}=setup(), records=[row(71),row(1),row(24)];
  const result=c.recentTrendingCards(records,now);
  assert.deepEqual(Array.from(result),[records[1],records[2],records[0]]);
  assert.equal(records[0].headline,'Story 71');assert.equal(result[0].extra,records[1].extra);
});
test('timezone offsets compare as instants and naive dates retain browser-local interpretation',()=>{
  const {c}=setup();
  assert.equal(c.trendingTimestamp('2026-09-25T17:30:00+05:30'),now);
  assert.equal(c.trendingTimestamp('25/09/2026 12:34'),new Date(2026,8,25,12,34).getTime());
  assert.equal(c.trendingTimestamp('2026-09-25T12:34:00'),new Date('2026-09-25T12:34:00').getTime());
});
test('future timestamps follow the explicit inclusive lower-bound contract',()=>{
  const {c}=setup();assert.equal(c.recentTrendingCards([row(-1)],now).length,1);
});
test('loader filters before render and cached activation rechecks age',async()=>{
  const {c}=setup();let rendered;
  const current=Date.now();const recent={...row(1),dateFound:new Date(current-hour).toISOString()};
  c.fetch=async()=>({ok:true,json:async()=>({items:[row(100000),recent,{headline:'missing',pub:new Date(current).toISOString()}]})});
  c.render=()=>{rendered=c.cards;};
  await c.loadNewsTracker();
  assert.equal(rendered.length,1);assert.equal(rendered[0].link,recent.link);
  c.newsTrackerCards[0].dateFound=new Date(current-73*hour).toISOString();
  await c.loadNewsTracker();assert.equal(c.cards.length,0);
});
test('feed failure clears results and does not fall back to old records',async()=>{
  const {c,grid}=setup();c.fetch=async()=>({ok:false,status:503});
  await assert.rejects(c.loadNewsTracker(),/503/);assert.equal(c.cards.length,0);assert.equal(c.newsTrackerLoaded,false);assert.match(grid.innerHTML,/Could not load/);
});
test('other sources bypass recency and retain the exact array',()=>{
  const {c,logs}=setup(),records=[row(1000),{}];
  for(const tab of ['cards','radar','reddit','official','search']){c.activeTab=tab;c.setCardsForActiveTab(records);assert.equal(c.cards,records);}
  assert.equal(logs.length,0);
});
test('selection passes the same eligible card to existing brief and long drafting flows',()=>{
  const {c}=setup(),record=row(1);c.cards=c.recentTrendingCards([record],now);c.showDraftTypeModal=()=>{};c.window={};
  let selected;c.openNewsBriefDraft=card=>{selected=card;};c.openLongFormDraft=card=>{selected=card;};
  for(const type of ['brief','long']){c.openDraft(0);assert.equal(c.pendingDraftIndex,0);c.chooseDraftType(type);assert.equal(selected,record);}
});
test('existing empty-state supplies the 3-day message without an older-record fallback',()=>{
  assert.match(block('render'),/No trending stories found in the last 3 days\./);
  assert.doesNotMatch(block('loadNewsTracker'),/WORKER/);
});
