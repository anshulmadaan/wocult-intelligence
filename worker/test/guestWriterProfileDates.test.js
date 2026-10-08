import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const fn=name=>{const start=html.indexOf('function '+name+'(');assert(start>=0,name);return html.slice(start,html.indexOf('\nfunction ',start+1));};
const names=['formatFirestoreDate','guestWriterProfileDate','guestWriterProfileDateLabel','guestWriterProfileDatesMeta','sortGuestWriterProfiles','guestWriterProfileStatusLabel','renderGuestWriterApplications','openGuestWriterApplication'];
function fixture(){
 const elements=Object.fromEntries(['guest-writer-applications-list','guest-writer-application-detail','guest-writer-applications-status'].map(id=>[id,{innerHTML:'',style:{}}]));
 const c={Date,document:{getElementById:id=>elements[id]},escapeHtml:s=>String(s).replaceAll('<','&lt;'),_guestWriterApplications:[]};c.window=c;
 vm.createContext(c);vm.runInContext(names.map(fn).join('\n'),c);return {c,elements};
}
const requested=new Date('2026-10-08T00:12:00Z'),approved=new Date('2026-10-08T01:00:00Z');
test('profile cards show date-only requests and detail shows dates with time in existing conventions',()=>{
 const {c,elements}=fixture();c._guestWriterApplications=[{id:'a',fullName:'Writer',status:'approved',createdAt:{toDate:()=>requested},approvedAt:{seconds:approved.getTime()/1000}}];
 c.renderGuestWriterApplications();c.openGuestWriterApplication('a');
 const card=elements['guest-writer-applications-list'].innerHTML,detail=elements['guest-writer-application-detail'].innerHTML;
 assert(card.includes('Requested: '+c.guestWriterProfileDateLabel(requested,false)));
 assert(card.includes('Approved: '+c.guestWriterProfileDateLabel(approved,false)));
 assert(!card.includes(c.formatFirestoreDate(requested)));
 assert(detail.includes('Requested: '+c.formatFirestoreDate(requested)));
 assert(detail.includes('Approved: '+c.formatFirestoreDate(approved)));
 assert(card.includes('font-size:var(--text-small);color:var(--g3)'));
});
test('pending/other profiles omit approval even with an old field; historical approvals never infer dates',()=>{
 const {c}=fixture();for(const status of ['pending','rejected','changes_requested',undefined])assert(!c.guestWriterProfileDatesMeta({status,createdAt:requested,approvedAt:approved},true).includes('Approved:'));
 assert.equal(c.guestWriterProfileDatesMeta({status:'approved',updatedAt:approved},false),'Requested: Date unavailable<br>Approved: Date unavailable');
 for(const value of [undefined,null,'','bad',{},false,{seconds:NaN},{toDate(){throw Error('bad');}},new Date('bad')])assert.equal(c.guestWriterProfileDateLabel(value,true),'Date unavailable');
 assert(c.guestWriterProfileDate({seconds:0}) instanceof Date);
});
test('request sorting is newest first, ignores updatedAt, keeps legacy rows last without mutation',()=>{
 const {c}=fixture();const rows=[{id:'missing'},{id:'old',createdAt:new Date('2020-01-01'),updatedAt:new Date('2030-01-01')},{id:'invalid',createdAt:'bad'},{id:'new',createdAt:requested}];
 assert.deepEqual(Array.from(c.sortGuestWriterProfiles(rows),x=>x.id),['new','old','missing','invalid']);assert.equal(rows[0].id,'missing');
 c._guestWriterApplications=rows;c.renderGuestWriterApplications();c.openGuestWriterApplication('missing');
});
test('loader includes more than 20 profiles and missing timestamps without orderBy exclusion',async()=>{
 const {c}=fixture();const docs=Array.from({length:25},(_,i)=>({id:String(i),data:()=>({status:'pending',...(i?{createdAt:requested}:{})})}));
 c.db={collection:name=>{assert.equal(name,'guest_writers');return {get:async()=>({forEach:callback=>docs.forEach(callback)})};}};
 vm.runInContext(fn('loadGuestWriterApplications'),c);await c.loadGuestWriterApplications();assert.equal(c._guestWriterApplications.length,25);assert.equal(c._guestWriterApplicationsLoading,false);
 c.db.collection=()=>({get:async()=>{throw Error('offline');}});await c.loadGuestWriterApplications({force:true});assert.equal(c._guestWriterApplicationsLoading,false);
});
function approvalFixture(storedStatus='pending',cachedStatus=storedStatus){
 const {c}=fixture();const record={status:storedStatus,createdAt:requested,fullName:'Keep content',...(storedStatus==='approved'?{approvedAt:approved}:{})};let writes=0,stampCalls=0;
 const sentinel={serverTimestamp:true},patches=[],alerts=[];
 c.currentUser={uid:'staff'};c.currentAccessMode='staff';c.isStaffUser=()=>true;c._guestWriterApplications=[{id:'a',status:cachedStatus}];
 c.firebase={firestore:{FieldValue:{serverTimestamp:()=>{stampCalls++;return sentinel;}}}};
 const snapshot=()=>({exists:true,data:()=>({...record})});const ref={get:async()=>snapshot()};
 c.db={collection:()=>({doc:()=>ref}),runTransaction:async callback=>callback({get:async()=>snapshot(),update:(r,patch)=>{writes++;patches.push(patch);for(const [key,value]of Object.entries(patch))record[key]=value===sentinel?approved:value;}})};
 c.renderGuestWriterApplications=()=>{};c.openGuestWriterApplication=()=>{};c.loadGuestWriterApplications=()=>{};c.alert=m=>alerts.push(m);
 vm.runInContext(fn('updateGuestWriterApplicationStatus'),c);return {c,record,patches,alerts,counts:()=>({writes,stampCalls})};
}
test('approval writes approvedAt with the status transition and refreshes resolved server date',async()=>{
 const {c,record,patches,counts}=approvalFixture();await c.updateGuestWriterApplicationStatus('a','approved');
 assert.equal(record.status,'approved');assert.equal(record.approvedAt,approved);assert.equal(record.createdAt,requested);assert.equal(record.fullName,'Keep content');
 assert.deepEqual(Object.keys(patches[0]).sort(),['approvedAt','status','updatedAt']);assert.equal(counts().stampCalls,2);assert.equal(c._guestWriterApplications[0].approvedAt,approved);
 await c.updateGuestWriterApplicationStatus('a','approved');assert.equal(counts().writes,1);
});
test('stale approval screens and historical approved profiles cannot rewrite or invent approval dates',async()=>{
 for(const historical of [false,true]){const {c,record,counts}=approvalFixture('approved','pending');if(historical)delete record.approvedAt;await c.updateGuestWriterApplicationStatus('a','approved');assert.equal(counts().writes,0);assert.equal(record.approvedAt,historical?undefined:approved);}
 const {c,patches}=approvalFixture();await c.updateGuestWriterApplicationStatus('a','rejected');assert(!('approvedAt'in patches[0]));
});
test('guest callers and failed approval transactions do not mutate the profile',async()=>{
 const {c,record,counts,alerts}=approvalFixture();c.currentAccessMode='guest_writer';await c.updateGuestWriterApplicationStatus('a','approved');assert.equal(counts().writes,0);
 c.currentAccessMode='staff';c.db.runTransaction=async()=>{throw Error('offline');};await c.updateGuestWriterApplicationStatus('a','approved');assert.equal(record.status,'pending');assert.equal(record.approvedAt,undefined);assert.match(alerts[0],/offline/);
 assert.match(fn('showGuestWriterApplications'),/guardStaffScreen\(\)/);
 assert(!fn('showGuestWriterPending').includes('guestWriterProfileDatesMeta'));
 assert.match(html,/id="app-version">v15\.33/);
});
