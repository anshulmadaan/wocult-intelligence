import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../app-ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app-ui.css', import.meta.url), 'utf8');

test('authenticated application shell exposes persistent navigation, profile and accessible controls', () => {
  assert.match(html, /id="app-sidebar"[^>]+aria-label="Application navigation"/);
  assert.match(html, /id="app-nav"[^>]+aria-label="Primary"/);
  assert.match(html, /id="app-profile-email"/);
  assert.match(html, /id="app-avatar"/);
  assert.match(html, /id="app-version">v15\.22/);
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
  assert.match(css, /--app-workspace-dark:#1b1f26/);
  assert.match(css, /--app-surface-dark:#242a33/);
});

test('authenticated top bar stays minimal while required controls remain available', () => {
  assert.match(html, /id="notification-bell"[^>]+aria-label="Notifications"/);
  assert.match(html, /id="app-theme-toggle"[^>]+aria-label="Switch to dark theme"/);
  assert.match(html, /class="app-logout"[^>]+onclick="logout\(\)"/);
  assert.match(css, /body\.app-authenticated #btn-back-landing[^}]+display:none!important/);
  assert.match(css, /body\.app-authenticated #btn-logout[^}]+display:none!important/);
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
  assert.match(css, /--app-workspace-dark:#1b1f26/);
  assert.match(css, /--app-surface-dark:#242a33/);
  assert.match(css, /--app-surface-raised-dark:#2b323d/);
});

test('legacy route and authorization functions remain in place', () => {
  for (const contract of ['pendingPodcastPrepSessionId','routeSignedInUser','handleAuthStateChanged','loadPodcastPrepGuestSession','loadGuestWriterProfile','handleAccessKey','logout','guardStaffScreen']) assert.match(html, new RegExp(contract));
  assert.match(html, /if \(podcastPrepFromUrl\)/);
  assert.match(html, /accessKeyFromUrl.+INT-/s);
});
