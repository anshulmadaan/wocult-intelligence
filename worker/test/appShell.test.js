import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../app-ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app-ui.css', import.meta.url), 'utf8');

test('authenticated application shell exposes persistent navigation, profile and accessible controls', () => {
  assert.match(html, /id="app-sidebar"[^>]+aria-label="Application navigation"/);
  assert.match(html, /id="app-nav"[^>]+aria-label="Primary"/);
  assert.match(html, /id="app-profile-email"/);
  assert.match(html, /id="app-avatar"/);
  assert.match(html, /id="app-version">v15\.26/);
  assert.match(ui, /APP_VERSION = '15\.26'/);
  assert.match(html, /app-ui\.css\?v=15\.26/);
  assert.match(html, /app-ui\.js\?v=15\.26/);
  assert.match(html, /id="app-menu-toggle"[^>]+aria-controls="app-sidebar"[^>]+aria-expanded="false"/);
  assert.match(html, /id="app-theme-toggle"[^>]+aria-label="Switch to dark theme"/);
  assert.match(css, /body\.app-authenticated \.app-sidebar\{display:flex\}/);
  assert.match(css, /:where\(button,a,input,textarea,select,\[tabindex\]\):focus-visible/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('staff navigation order is exact and Podcast directly follows Curate interviews', () => {
  const labels = [...ui.matchAll(/navItem\('[^']+','([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels.slice(0, 8), ['Home','Draft new stories','Curate interviews','Podcast','Manage community','Editorial tracker','Web Comm','Admin']);
  assert.equal(labels.indexOf('Podcast'), labels.indexOf('Curate interviews') + 1);
});

test('role navigation is derived from existing access modes and admin rule remains authoritative', () => {
  assert.match(ui, /currentAccessMode === 'staff'.+isStaffUser\(currentUser\)/);
  assert.match(ui, /currentAccessMode === 'podcast_prep_guest'/);
  assert.match(ui, /currentAccessMode === 'guest_writer'/);
  assert.match(ui, /currentAccessMode === 'guest'/);
  assert.match(ui, /isAdminUser\(currentUser\)/);
  assert.match(html, /var ADMIN_EMAIL = ["']anmadaan@gmail\.com["']/);
  assert.match(html, /function guardAdminScreen\(\)/);
});

test('section overviews map only approved existing tools and use shared keyboard-accessible launcher buttons', () => {
  assert.match(ui, /title:'Draft new stories'/);
  for (const title of ['Draft from trending news','Draft from a URL','Write your own story','Manual news brief','Manual long-view story','Automated News Briefs']) assert.match(ui, new RegExp(`\\['${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(ui, /title:'Curate interviews'.+Prepare and send questions.+Guest interview submissions/s);
  assert.doesNotMatch(ui, /title:'Curate interviews'.+Podcast Prep Room.+title:'Podcast'/s);
  assert.match(ui, /class="app-launcher"/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1050px\).*repeat\(2,minmax\(0,1fr\)\)/s);
  assert.match(css, /@media\(max-width:600px\).*grid-template-columns:1fr/s);
});

test('home uses real existing sources, Editorial Calendar only for upcoming, and no invented recent tracking', () => {
  assert.match(ui, /db\.collection\('podcast_sessions'\)/);
  assert.match(ui, /db\.collection\('articles'\)\.where\('sourceType','==','guest_writer'\)/);
  assert.match(ui, /db\.collection\('unsent_submissions'\)/);
  assert.match(ui, /db\.collection\('editorial_calendar'\)/);
  assert.match(ui, /No activity history available/);
  assert.doesNotMatch(ui, /fake|dummy/i);
});

test('theme defaults to light, persists only UI preference and supports designed token overrides', () => {
  assert.equal((ui.match(/wocult_ui_theme/g) || []).length >= 1, true);
  assert.match(ui, /return 'light'/);
  assert.match(ui, /localStorage\.setItem\(THEME_KEY,next\)/);
  assert.doesNotMatch(ui, /matchMedia|prefers-color-scheme/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /--app-workspace-dark:#1C1C1F/);
  assert.match(css, /--app-surface-dark:#232326/);
});

test('authenticated top bar stays minimal while required controls remain available', () => {
  assert.match(html, /id="notification-bell"[^>]+aria-label="Notifications"/);
  assert.match(html, /id="app-theme-toggle"[^>]+aria-label="Switch to dark theme"/);
  assert.match(html, /class="app-logout"[^>]+onclick="logout\(\)"/);
  const topbar = html.slice(html.indexOf('<div class="topbar">'), html.indexOf('<div id="notifications-panel"'));
  assert.doesNotMatch(topbar, /app-page-title|tbar-sub|btn-back-landing|btn-logout|top-auth-email|Search|btn-draft-url|btn-new-guest-story|id="rbtn"/);
  assert.match(topbar, /notification-bell/);
  assert.match(topbar, /app-theme-toggle/);
});

test('home records keep title and metadata as distinct elements', () => {
  assert.match(ui, /class="app-record-title"/);
  assert.match(ui, /class="app-record-meta"/);
  assert.match(css, /\.app-record-title\{display:block/);
  assert.match(css, /\.app-record-meta\{display:block/);
});

test('shell tokens preserve visible controls in light mode and layered surfaces in dark mode', () => {
  assert.match(css, /--app-control-text:#202733/);
  assert.match(css, /--app-control-border:#cfd5de/);
  assert.match(css, /--app-workspace-dark:#1C1C1F/);
  assert.match(css, /--app-surface-dark:#232326/);
  assert.match(css, /--app-surface-raised-dark:#29292D/);
});

test('legacy route and authorization functions remain in place', () => {
  for (const contract of ['pendingPodcastPrepSessionId','routeSignedInUser','handleAuthStateChanged','loadPodcastPrepGuestSession','loadGuestWriterProfile','handleAccessKey','logout','guardStaffScreen']) assert.match(html, new RegExp(contract));
  assert.match(html, /if \(podcastPrepFromUrl\)/);
  assert.match(html, /accessKeyFromUrl.+INT-/s);
});

test('authenticated shell gives the top bar and scrolling workspace separate viewport regions', () => {
  assert.match(css, /--app-topbar-height:64px/);
  assert.match(css, /body\.app-authenticated\{position:fixed;inset:0;[^}]*overflow:hidden;display:grid/);
  assert.match(css, /body\.app-authenticated>\.app-workspace\{grid-column:2;grid-row:2;position:relative/);
  assert.match(css, /body\.app-authenticated>\.app-workspace\{[^}]+overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /body\.app-authenticated \.topbar\{[^}]+height:var\(--app-topbar-height\)/);
  assert.doesNotMatch(css, /body\.app-authenticated>\.app-workspace\{[^}]+100vh/);
});

test('all top-level authenticated screens use the one shared workspace contract', () => {
  for (const id of ['landing','main','workflow','guest-placeholder','guest-writer-registration','guest-writer-pending','guest-writer-dashboard','guest-writer-stories','guest-writer-idea','guest-writer-idea-discussion','guest-writer-status-screen']) {
    assert.match(html, new RegExp(`id="${id}"[^>]+class="[^"]*app-workspace`));
  }
  assert.match(ui, /title:'Draft new stories'/);
  assert.match(ui, /title:'Podcast'/);
  assert.match(html, /id="podcast-prep-guest-screen" class="landing"/);
  assert.match(ui, /body\.app-authenticated > \.app-workspace/);
});

test('workspace scrolling preserves stable sidebar, responsive drawer and programmatic top resets', () => {
  assert.match(css, /\.app-sidebar\{position:fixed/);
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(css, /body\.app-authenticated>\.app-workspace\{grid-column:1\}/);
  assert.match(css, /body\.app-drawer-open \.app-sidebar\{transform:translateX\(0\)\}/);
  assert.match(ui, /scrollAppWorkspaceToTop/);
  assert.match(ui, /workspaces\[index\]\.scrollTo\(\{top:0, left:0, behavior:'auto'\}\)/);
  assert.doesNotMatch(html, /window\.scrollTo\(0,\s*0\)/);
});

test('approved Dark tokens and launcher accents are centralized', () => {
  for (const token of ['--app-sidebar:#141416','--app-accent:#FFC500','--app-border:rgba(255,255,255,.07)','--app-sidebar-active:rgba(255,197,0,.14)','--app-accent-soft:rgba(255,197,0,.13)']) assert.ok(css.includes(token), token);
  assert.ok(css.includes('--app-icon-accent:var(--app-accent)'));
  assert.ok(css.includes('color:var(--app-icon-accent);margin:0'));
  assert.ok(css.includes('body.app-authenticated a{color:var(--app-text)}'));
  assert.ok(css.includes('body.app-authenticated .landing{background:var(--app-bg)'));
});

test('title ownership and dedicated shell rows do not depend on hiding duplicate headings', () => {
  assert.doesNotMatch(html, /id="app-page-title"/);
  assert.doesNotMatch(ui, /getElementById\('app-page-title'\)/);
  assert.ok(css.includes('grid-template-rows:var(--app-topbar-height) minmax(0,1fr)'));
  assert.ok(css.includes('scroll-padding-block-start:var(--app-topbar-height)'));
  const main = html.slice(html.indexOf('<div id="main"'), html.indexOf('<!-- /main -->'));
  for (const id of ['stats-bar','saved-section','saved-toggle-bar','btn-draft-url','rbtn','top-updated-status','err']) assert.ok(main.includes('id="'+id+'"'), id);
});

function themeFixture(storage) {
  const attributes = {};
  const context = {localStorage:storage,window:{},document:{documentElement:{setAttribute:(k,v)=>{attributes[k]=v;},getAttribute:k=>attributes[k]},getElementById:()=>null}};
  vm.runInNewContext("var THEME_KEY='wocult_ui_theme';"+ui.slice(ui.indexOf('  function readTheme()'),ui.indexOf('  var sectionDefinitions')),context);
  return {context,attributes};
}

test('theme uses Light for missing, invalid or inaccessible optional storage', () => {
  for (const storage of [{getItem:()=>null},{getItem:()=> 'invalid'},{getItem:()=>{throw new Error('Storage blocked');}}]) {
    assert.equal(themeFixture(storage).context.readTheme(),'light');
  }
  assert.equal(themeFixture({getItem:()=> 'dark'}).context.readTheme(),'dark');
});

test('theme toggles still work when storage writes fail and no control is mounted', () => {
  const {context,attributes}=themeFixture({setItem:()=>{throw new Error('Storage blocked');}});
  context.applyTheme('light');context.window.toggleAppTheme();
  assert.equal(attributes['data-theme'],'dark');
  context.window.toggleAppTheme();assert.equal(attributes['data-theme'],'light');
});
