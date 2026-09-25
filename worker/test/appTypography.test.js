import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../../app-ui.css',import.meta.url),'utf8');
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));

test('Light surfaces, contrast and sidebar are deliberate centralized tokens',()=>{
  const light=rules.find(r=>r.selector===':root').body;
  for(const token of ['--app-bg:#F6F7F8','--app-surface:#fff','--app-sidebar:#182129','--app-description:#5F6B7A','--app-meta:#687484','--app-control-text:#202733','--app-control-bg:#fff']) assert.ok(light.includes(token),token);
  assert.ok(css.includes('.app-launcher{background:var(--app-surface)'));
  assert.ok(css.includes('.notification-bell{background:var(--app-control-bg);color:var(--app-control-text)'));
  assert.ok(css.includes(':root body.app-authenticated a{color:var(--app-text)}'));
});

test('shared typography tokens define page, section, card, body, navigation and profile hierarchy',()=>{
  for(const token of ['--font-ui:','--font-heading:var(--font-ui)','--text-page-title:28px','--text-card-title:14.5px','--text-body:14px','--text-small:12.5px','--text-meta:11.5px','--text-nav:13.5px','--text-section-label:12px','--line-height-body:1.5','--tracking-section-label:.8px']) assert.ok(css.includes(token),token);
  for(const [selector,token] of [['.app-page-header h1','--text-page-title'],['.app-page-header p','--text-subtitle'],['.app-launcher-title','--text-card-title'],['.app-launcher-desc','--text-small'],['.app-draft-divider','--tracking-section-label'],['.app-nav-item','--text-nav'],['.app-profile-copy small','--text-version']]) assert.ok(rules.some(r=>r.selector.includes(selector)&&r.body.includes('var('+token+')')),selector);
});

test('theme selectors cannot fork typography, component dimensions or spacing',()=>{
  for(const rule of rules.filter(r=>r.selector.includes('data-theme'))){
    assert.doesNotMatch(rule.body,/(?:^|;)\s*(?:font(?:-family|-size|-weight)?|line-height|letter-spacing|padding(?:-[\w-]+)?|margin(?:-[\w-]+)?|--font-[\w-]+|--text-[\w-]+|--app-sidebar-width|--app-chip-size)\s*:/,rule.selector);
  }
  for(const token of ['--app-sidebar-width:260px','--app-chip-size:38px','--app-grid-gap:18px','--app-card-padding:20px','--app-radius-lg:14px']) assert.ok(css.includes(token),token);
});

test('shared input and button states preserve semantics and keyboard affordances',()=>{
  for(const contract of ['--app-control-height:40px',':focus-visible','[aria-invalid="true"]','[aria-busy="true"]',':disabled','input[type="checkbox"]','input[type="radio"]','font-family:var(--font-ui)']) assert.ok(css.includes(contract),contract);
  assert.doesNotMatch(css,/appearance:none/);
  assert.ok(css.includes('transition-duration:0s!important'));
});
