import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../idea-board.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../app-ui.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
test('Idea board uses existing staff-only navigation and contextual route registry',()=>{
 const labels=[...ui.matchAll(/navItem\('[^']+','([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(labels.slice(0,3),['Home','Idea board','Draft new stories']);
 const nav=readFileSync(new URL('../../app-navigation.js',import.meta.url),'utf8');
 assert.match(nav,/\['home','ideas','draft'/);
 assert.match(html,/idea-board\.js\?v=15\.33/);
 assert.match(ui,/isStaffUser\(currentUser\)/);assert.match(source,/isAdminUser\(currentUser\)/);
});
test('guest and anonymous mounts cannot read Firestore or render staff content',()=>{
 for(const mode of ['guest_writer','podcast_prep_guest','guest','']){
  let reads=0;const c={window:{},currentAccessMode:mode,currentUser:{uid:'guest'},isStaffUser:()=>false,document:{},db:{collection(){reads++;throw Error('Unauthorized read');}}};
  vm.createContext(c);vm.runInContext(source,c);const container={innerHTML:'unchanged'};c.window.mountIdeaBoard(container);
  assert.equal(reads,0);assert.equal(container.innerHTML,'unchanged');
 }
});
test('forms, cards and comments expose accessible V1 fields with shared semantic surfaces',()=>{
 for(const text of ['+ New idea','Capture the ideas worth coming back to.','+ Add your first idea','Select priority','Save idea','Post comment','Edit idea','Delete this idea?'])assert(source.includes(text),text);
 assert.match(source,/type="button" class="idea-card"/);
 assert.match(source,/name="title" required/);assert.match(source,/name="description" required/);assert.match(source,/name="priority" required/);
 assert.match(source,/dialog\.showModal\(\)/);assert.match(source,/addEventListener\('cancel'/);
 assert.match(source,/orderBy\('createdAt','desc'\)\.onSnapshot/);assert.match(source,/orderBy\('createdAt','asc'\)\.onSnapshot/);
 assert.match(source,/if \(stopIdeas\) stopIdeas\(\)/);assert.match(source,/if \(stopComments\) stopComments\(\)/);
 assert.match(source,/createdByUid:currentUser\.uid/);assert.match(source,/serverTimestamp\(\)/);
 assert.doesNotMatch(source,/alert\(|window\.location|status:|assignee|dueDate|owner:/);
});
test('creator editing is UID-based, admin editing preserves metadata and only admin sees deletion',()=>{
 assert.match(source,/admin\(\) \|\| idea\.createdByUid === currentUser\.uid/);
 assert.match(source,/editable\(idea\) \? button\('Edit idea'/);
 assert.match(source,/admin\(\) \? button\('Delete idea'/);
 assert.match(source,/var data = \{title:title,description:description,priority:priority,updatedAt:stamp\(\)\}/);
 assert.match(source,/if \(idea\) await db\.collection\('ideas'\)\.doc\(idea\.id\)\.update\(data\)/);
 assert.match(source,/await ref\.delete\(\);parentRemoved=true/);
 assert.match(source,/collection\('comments'\)\.limit\(400\)/);
 assert.match(rules,/collection != "ideas"/);
 assert.match(rules,/allow delete: if isCanvaAdmin\(\)/);
 assert.match(rules,/affectedKeys\(\)\.hasOnly\(\['title','description','priority','updatedAt'\]\)/);
});
