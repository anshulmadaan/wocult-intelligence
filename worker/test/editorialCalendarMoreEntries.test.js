import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function functionBlock(name) {
  const start = html.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < html.length; index += 1) {
    const char = html[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.childNodes = this.children;
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.type = '';
  }

  set id(value) {
    this._id = value;
    if (this.ownerDocument) this.ownerDocument.elements.set(value, this);
  }

  get id() {
    return this._id || '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = value;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (child.id) this.ownerDocument.elements.set(child.id, child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  dispatchEvent(event) {
    event.currentTarget = this;
    (this.listeners[event.type] || []).forEach((handler) => handler(event));
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, currentTarget: this });
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this.focused = true;
  }

  querySelector(selector) {
    if (selector === 'button') return findDescendant(this, (el) => el.tagName === 'BUTTON');
    if (selector.startsWith('#')) return this.ownerDocument.getElementById(selector.slice(1));
    return null;
  }
}

function findDescendant(element, predicate) {
  for (const child of element.children) {
    if (predicate(child)) return child;
    const nested = findDescendant(child, predicate);
    if (nested) return nested;
  }
  return null;
}

function allDescendants(element, predicate, found = []) {
  for (const child of element.children) {
    if (predicate(child)) found.push(child);
    allDescendants(child, predicate, found);
  }
  return found;
}

function createDocument() {
  const document = {
    elements: new Map(),
    listeners: {},
    activeElement: null,
    body: null,
    createElement(tagName) {
      return new TestElement(tagName, document);
    },
    getElementById(id) {
      return document.elements.get(id) || null;
    },
    addEventListener(type, handler) {
      if (!document.listeners[type]) document.listeners[type] = [];
      document.listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      document.listeners[type] = (document.listeners[type] || []).filter((fn) => fn !== handler);
    },
    dispatchKey(key) {
      const event = {
        type: 'keydown',
        key,
        prevented: false,
        preventDefault() { this.prevented = true; },
      };
      (document.listeners.keydown || []).forEach((handler) => handler(event));
      return event;
    },
  };
  document.body = new TestElement('body', document);
  return document;
}

function loadHarness(entries) {
  const document = createDocument();
  const opened = [];
  const context = {
    document,
    console: { warn() {}, error() {} },
    alert() { context.alertCalls += 1; },
    alertCalls: 0,
    editorialCalendarState: {
      entries,
      moreModalOpen: false,
      moreModalReturnFocus: null,
    },
    editorialCalendarFilteredEntries: () => entries,
    editorialCalendarOpenEditor(entryId, dateKey, occurrenceDate) {
      opened.push({ entryId, dateKey, occurrenceDate });
    },
  };
  vm.createContext(context);
  vm.runInContext([
    functionBlock('editorialCalendarDateKey'),
    functionBlock('editorialCalendarTimeLabel'),
    functionBlock('editorialCalendarEntrySort'),
    functionBlock('editorialCalendarStatusColor'),
    functionBlock('editorialCalendarShowDayMore'),
    functionBlock('editorialCalendarEnsureMoreModal'),
    functionBlock('editorialCalendarOpenMoreModal'),
    functionBlock('editorialCalendarDateLabel'),
    functionBlock('editorialCalendarRenderMoreEntries'),
    functionBlock('editorialCalendarMoreLabels'),
    functionBlock('editorialCalendarSelectMoreEntry'),
    functionBlock('editorialCalendarPreventMoreEscape'),
    functionBlock('editorialCalendarHandleMoreBackdrop'),
    functionBlock('editorialCalendarCloseMoreModal'),
  ].join('\n'), context);
  return { context, document, opened };
}

function calendarEntries(extra = {}) {
  return [
    { id: 'visible-1', publishDate: '2026-07-28', publishTime: '08:00', title: 'Visible 1', contentType: 'News piece', channels: ['Wocult'] },
    { id: 'visible-2', publishDate: '2026-07-28', publishTime: '09:00', title: 'Visible 2', contentType: 'News piece', channels: ['LinkedIn'] },
    { id: 'visible-3', publishDate: '2026-07-28', publishTime: '10:00', title: 'Visible 3', contentType: 'News piece', channels: ['Instagram'] },
    { id: 'hidden-1', publishDate: '2026-07-28', publishTime: '11:00', title: '<img src=x onerror=alert(1)> Hidden', contentType: 'Social post', channels: ['Wocult', 'LinkedIn'], contentGroup: 'Source desk', occurrenceDate: '2026-07-28', ...extra },
    { id: 'hidden-2', publishDate: '2026-07-28', publishTime: '12:00', title: 'Hidden 2', status: 'Ready' },
  ];
}

test('Editorial Calendar more interaction opens modal without alert and renders hidden records', () => {
  const { context, document } = loadHarness(calendarEntries());
  const moreButton = document.createElement('button');
  document.activeElement = moreButton;
  context.editorialCalendarShowDayMore('2026-07-28');

  const modal = document.getElementById('editorial-calendar-more-modal');
  const list = document.getElementById('editorial-calendar-more-list');
  const count = document.getElementById('editorial-calendar-more-count');
  const records = allDescendants(list, (el) => el.className === 'editorial-more-record');

  assert.equal(context.alertCalls, 0);
  assert.equal(modal.style.display, 'flex');
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(count.textContent, '2 additional records');
  assert.equal(records.length, 2);
  assert.equal(records[0].children[0].textContent, '11:00 AM <img src=x onerror=alert(1)> Hidden');
  assert.equal(records[1].children[0].textContent, '12:00 PM Hidden 2');
  assert.equal(document.activeElement, records[0]);
});

test('Editorial Calendar hidden record click reuses existing editor opener and closes modal', () => {
  const { context, document, opened } = loadHarness(calendarEntries());
  const moreButton = document.createElement('button');
  document.activeElement = moreButton;
  context.editorialCalendarShowDayMore('2026-07-28');

  const modal = document.getElementById('editorial-calendar-more-modal');
  const list = document.getElementById('editorial-calendar-more-list');
  const records = allDescendants(list, (el) => el.className === 'editorial-more-record');
  records[0].click();

  assert.deepEqual(opened, [{ entryId: 'hidden-1', dateKey: null, occurrenceDate: '2026-07-28' }]);
  assert.equal(modal.style.display, 'none');
  assert.equal(document.body.style.overflow, '');
  assert.equal(context.editorialCalendarState.moreModalOpen, false);
});

test('Editorial Calendar more modal close button, Escape and outside click restore focus', () => {
  const { context, document } = loadHarness(calendarEntries());
  const moreButton = document.createElement('button');
  document.activeElement = moreButton;
  context.editorialCalendarShowDayMore('2026-07-28');
  const modal = document.getElementById('editorial-calendar-more-modal');
  const closeButton = allDescendants(modal, (el) => el.tagName === 'BUTTON')[0];
  closeButton.click();
  assert.equal(modal.style.display, 'none');
  assert.equal(document.activeElement, moreButton);

  document.activeElement = moreButton;
  context.editorialCalendarShowDayMore('2026-07-28');
  const escapeEvent = document.dispatchKey('Escape');
  assert.equal(escapeEvent.prevented, true);
  assert.equal(modal.style.display, 'none');
  assert.equal(document.activeElement, moreButton);

  document.activeElement = moreButton;
  context.editorialCalendarShowDayMore('2026-07-28');
  modal.dispatchEvent({ type: 'mousedown', target: modal, currentTarget: modal });
  assert.equal(modal.style.display, 'none');
  assert.equal(document.activeElement, moreButton);
});

test('Editorial Calendar more modal tolerates missing optional fields and keeps text rendering safe', () => {
  const { context, document } = loadHarness(calendarEntries({ contentType: '', channels: null, contentGroup: '' }));
  context.editorialCalendarShowDayMore('2026-07-28');
  const list = document.getElementById('editorial-calendar-more-list');
  const records = allDescendants(list, (el) => el.className === 'editorial-more-record');
  assert.equal(records.length, 2);
  assert.equal(records[0].innerHTML, '');
  assert.equal(records[0].children[0].textContent.includes('<img src=x onerror=alert(1)>'), true);
  assert.doesNotThrow(() => context.editorialCalendarRenderMoreEntries(list, [{ id: 'bare', publishDate: '2026-07-28' }]));
});

test('Editorial Calendar more modal implementation preserves accessibility and existing opener contracts', () => {
  assert.doesNotMatch(functionBlock('editorialCalendarShowDayMore'), /alert\(/);
  assert.match(functionBlock('editorialCalendarShowDayMore'), /\.slice\(3\)/);
  assert.match(functionBlock('editorialCalendarEntryChipHtml'), /editorialCalendarOpenEditor/);
  assert.match(functionBlock('editorialCalendarEntryChipHtml'), /escapeHtml\(entry\.id\)/);
  assert.match(functionBlock('editorialCalendarSelectMoreEntry'), /editorialCalendarOpenEditor\(entry\.id, null, entry\.occurrenceDate \|\| ''\)/);
  assert.doesNotMatch(functionBlock('editorialCalendarRenderMoreEntries'), /innerHTML|onclick=/);
  assert.match(functionBlock('editorialCalendarRenderMoreEntries'), /document\.createElement\('button'\)/);
  assert.match(functionBlock('editorialCalendarRenderMoreEntries'), /textContent =/);
  assert.match(functionBlock('editorialCalendarOpenMoreModal'), /document\.body\.style\.overflow = 'hidden'/);
  assert.match(functionBlock('editorialCalendarCloseMoreModal'), /moreModalReturnFocus\.focus\(\)/);
  assert.match(html, /\.editorial-more-list\{[^}]*overflow:auto/);
  assert.equal([...html.matchAll(/\sid="editorial-calendar-more-(modal|title|count|list)"/g)].length, 0);
});
