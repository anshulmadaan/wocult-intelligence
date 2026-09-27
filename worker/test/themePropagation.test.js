import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../app-ui.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../app-ui.js',import.meta.url),'utf8');
const inventory=JSON.parse(readFileSync(new URL('../../scripts/theme-screen-inventory.json',import.meta.url),'utf8'));
const fn=name=>{const start=html.indexOf('function '+name+'(');return html.slice(start,html.indexOf('\nfunction ',start+1));};
const tag=id=>html.match(new RegExp('<[^>]+\\bid="'+id+'"[^>]*>'))?.[0]||'';
test('screen inventory covers every static application/auth/guest root and renderer',()=>{
 const roots=[...html.matchAll(/<(?:div|section)[^>]+>/g)].map(m=>m[0]).filter(t=>/class="[^"]*\b(?:landing|app-workspace)\b/.test(t)).map(t=>t.match(/\bid="([\w-]+)"/)?.[1]).filter(Boolean);
 assert.deepEqual(roots,inventory.roots);
 for(const [,name] of html.matchAll(/(?:async )?function ((?:show|render|open|load)\w+)\(/g))assert.ok(inventory.renderEntryPoints.includes(name),name);
});
test('one root theme and local preference cover authenticated and unauthenticated surfaces',()=>{
 assert.match(ui,/document\.documentElement\.setAttribute\('data-theme', theme\)/);
 assert.match(ui,/var THEME_KEY = 'wocult_ui_theme'/);assert.match(ui,/return 'light'/);
 assert.doesNotMatch(ui,/guest.*theme.*localStorage|firestore.*theme/i);
 for(const token of ['--app-bg','--app-surface','--app-surface-2','--app-input-bg','--app-input-text','--app-input-placeholder','--app-backdrop','--app-dialog-shadow'])assert.ok(css.includes(token+':'),token);
 assert.match(css,/:root body\{font-family:var\(--font-ui\)/);
});
test('literal theme colors cannot return in feature CSS or inline markup',()=>{
 const styles=[...html.matchAll(/style="([^"]*)"/g)].map(m=>m[1]).join('\n')+[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 assert.doesNotMatch(styles,/(?:background(?:-color)?|color|border(?:-color)?)\s*:[^;{}"]*#[0-9a-f]{3,8}\b/i);
 assert.doesNotMatch(css,/\[style\*="background:#/);
});
test('News Brief workspace, tabs, forms and nested surfaces consume shared tokens',()=>{
 assert.match(html,/#workflow\{[^}]*background:var\(--app-bg\)/);
 assert.match(css,/:root \.wf-header\{background:var\(--app-surface\)/);
 assert.match(css,/\.wf-step\.active\{[^}]*var\(--app-accent-soft\)/);
 assert.match(css,/contenteditable="true"[^}]*var\(--app-input-bg\)/);
 assert.match(fn('renderNewsBriefInstructionScreen'),/font-size:var\(--text-card-title\)/);
});
test('Podcast staff detail and dynamic guest panels share the root surface system',()=>{
 assert.match(tag('podcast-prep-detail'),/app-panel-surface/);
 for(const name of ['renderPodcastPrepSessions','renderPodcastPrepStaffDetail','renderPodcastPrepGuestWelcome','renderPodcastPrepQuestion','showPodcastPrepSubmitReview'])assert.match(fn(name),/app-panel-surface/,name);
 assert.match(fn('renderPodcastPrepStaffDetail'),/class="wf-input" readonly/);
 assert.match(css,/\.app-panel-surface \.app-panel-surface\{background:var\(--app-surface-2\)/);
 assert.match(fn('startPodcastPrepWaveform'),/getComputedStyle\(document.documentElement\)/);
 assert.doesNotMatch(fn('startPodcastPrepWaveform'),/fillRect\(0, 0, width, height\)/);
});
test('Guest Writer, interview and auth reuse shared fonts, panels and controls',()=>{
 for(const id of ['guest-writer-registration','guest-writer-dashboard','guest-writer-idea','guest-writer-status-screen','guest-placeholder','access-screen'])assert.ok(tag(id),id);
 for(const name of ['renderGuestInterview','renderGuestRefinedReview','renderGuestWriterDashboardTable'])assert.match(fn(name),/app-panel-surface|var\(--/);
 assert.match(css,/\.login-panel\{background:var\(--app-surface\)/);
 assert.match(css,/\.login-password-toggle\{background:var\(--app-surface-2\)/);
 assert.match(css,/:root a\{color:var\(--app-text\)/);
});
test('shared variants cover dialogs, buttons, controls and semantic states',()=>{
 for(const variant of ['primary','secondary','tertiary','destructive'])assert.ok(css.includes('.app-button-'+variant));
 for(const id of ['draft-type-modal','gw-welcome-modal','news-brief-social-modal','canva-instructions-modal','editorial-tracker-overlay'])assert.match(tag(id),/var\(--app-backdrop\)/,id);
 assert.match(css,/:root table\{background:var\(--app-surface\)/);
 for(const state of ['error','warning','success','info'])assert.ok(css.includes('var(--app-'+state+')'));
 assert.match(css,/:root :is\(button,input,textarea,select\):disabled/);
});
