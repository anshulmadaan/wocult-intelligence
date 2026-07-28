import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  WORKER_ADMIN_TOKEN: 'admin-token',
  WEBFLOW_TOKEN: 'webflow-token',
  NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
};

function authedRequest(path, body) {
  return new Request('https://worker.test' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer admin-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function unauthenticatedBrowserPost(path) {
  return new Request('https://worker.test' + path, {
    method: 'POST',
    headers: {
      Origin: 'https://intelligence.wocult.com',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
}

function validPostBody(overrides = {}) {
  return {
    fieldData: {
      title: 'AI at work needs better managers',
      slug: 'ai-at-work-needs-better-managers',
      subtitle: 'A closer look at how companies can manage AI adoption without losing trust.',
      seoDescription: 'A Wocult long-view story on AI adoption, managers and trust at work.',
      intro40: 'AI adoption at work is moving faster than most managers expected, and the pressure now sits with leaders who must explain what changes without eroding employee trust.',
      storyIntro: 'AI adoption at work is moving faster than most managers expected.',
      excerpt: 'AI adoption is changing how teams work, but the central management challenge is trust. Companies need clearer communication, stronger judgement and better accountability.',
      shortBrief: 'AI adoption is changing how teams work, but the central management challenge is trust. Companies need clearer communication, stronger judgement and accountability.',
      body: '<p>The rest of the story explains what leaders should do next.</p>',
      publishDate: '2026-07-17',
      imageUrl: 'https://cdn.example.com/image.jpg',
      writer: 'Wocult Team',
      category: 'Should not be sent',
      featured: false,
      tags: [],
    },
    isDraft: true,
    isArchived: false,
    ...overrides,
  };
}

test('/webflow-posts unauthorized browser-origin request includes CORS headers', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{}', { status: 200 });
  });

  const response = await worker.fetch(unauthenticatedBrowserPost('/webflow-posts'), env);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Methods') || '', /\bPOST\b/);
  assert.match(response.headers.get('Access-Control-Allow-Headers') || '', /Authorization/i);
  assert.equal(calls.length, 0);
});

test('/webflow-news unauthorized browser-origin request includes CORS headers', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{}', { status: 200 });
  });

  const response = await worker.fetch(unauthenticatedBrowserPost('/webflow-news'), env);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Methods') || '', /\bPOST\b/);
  assert.match(response.headers.get('Access-Control-Allow-Headers') || '', /Authorization/i);
  assert.equal(calls.length, 0);
});

test('/webflow-posts maps only approved THA Posts field slugs and creates a draft', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: 'wf-post-1', fieldData: { slug: 'ai-at-work-needs-better-managers' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const response = await worker.fetch(authedRequest('/webflow-posts', validPostBody()), env);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.webflow.com/v2/collections/695be252bae2cf37c3a4b17b/items');
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.isDraft, true);
  assert.equal(sent.isArchived, false);
  assert.deepEqual(Object.keys(sent.fieldData).sort(), [
    '40-word-intro',
    'body',
    'excerpt',
    'four-line-intro',
    'name',
    'post-image',
    'publish-date',
    'seo-description',
    'slug',
    'story-intro',
    'sub-title-heading',
    'writer',
  ].sort());
  assert.equal(sent.fieldData.category, undefined);
  assert.equal(sent.fieldData.featured, undefined);
  assert.equal(sent.fieldData.tags, undefined);
});

test('/webflow-posts rejects invalid post payload before Webflow call', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{}', { status: 200 });
  });

  const response = await worker.fetch(authedRequest('/webflow-posts', validPostBody({
    fieldData: {
      ...validPostBody().fieldData,
      slug: 'Bad Slug',
      shortBrief: 'Too short',
    },
  })), env);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
  const body = await response.json();
  assert.equal(body.ok, false);
});

test('/webflow-news remains on the News collection', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: 'wf-news-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const response = await worker.fetch(authedRequest('/webflow-news', {
    fieldData: {
      title: 'A news brief',
      slug: 'a-news-brief',
      standfirst: 'A short standfirst',
      body: '<p>News body</p>',
      publishedDate: '2026-07-28T12:15:00.000Z',
    },
  }), env);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.webflow.com/v2/collections/6a4d6ad32871d46ed1edc6a4/items');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.fieldData.publishedDate, '2026-07-28T12:15:00.000Z');
  assert.equal(payload.fieldData['published-date'], '2026-07-28T12:15:00.000Z');
  assert.equal(payload.fieldData['published-iso'], '2026-07-28T12:15:00.000Z');
});

test('/webflow-news enforces News Brief headline, standfirst and slug hard limits before Webflow', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{}', { status: 200 });
  });

  const base = {
    fieldData: {
      title: 'A valid news headline for Wocult readers about hiring',
      slug: 'valid-news-headline-hiring',
      standfirst: 'A concise standfirst below the hard maximum.',
      body: '<p>News body</p>',
      publishedDate: '2026-07-28T12:15:00.000Z',
    },
  };

  const tooLongHeadline = await worker.fetch(authedRequest('/webflow-news', {
    fieldData: { ...base.fieldData, title: 'x'.repeat(71) },
  }), env);
  assert.equal(tooLongHeadline.status, 400);

  const tooLongStandfirst = await worker.fetch(authedRequest('/webflow-news', {
    fieldData: { ...base.fieldData, standfirst: 'x'.repeat(156) },
  }), env);
  assert.equal(tooLongStandfirst.status, 400);

  const badSlug = await worker.fetch(authedRequest('/webflow-news', {
    fieldData: { ...base.fieldData, slug: 'bad slug-' },
  }), env);
  assert.equal(badSlug.status, 400);
  assert.equal(calls.length, 0);
});

test('/webflow-news rejects missing publication timestamp without replacing it', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ id: 'wf-news-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const response = await worker.fetch(authedRequest('/webflow-news', {
    fieldData: {
      title: 'A news brief',
      slug: 'a-news-brief',
      standfirst: 'A short standfirst',
      body: '<p>News body</p>',
    },
  }), env);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /Publication date and time are missing\./);
});
