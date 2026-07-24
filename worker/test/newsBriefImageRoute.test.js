import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  WORKER_ADMIN_TOKEN: 'admin-token',
  WEBFLOW_TOKEN: 'webflow-token',
  WEBFLOW_SITE_ID: 'site-1',
  WEBFLOW_NEWS_COLLECTION_ID: 'news-collection',
  FIREBASE_PROJECT_ID: 'wocult-tasks',
  FIREBASE_ACCESS_TOKEN: 'firebase-access-token',
  UNSPLASH_ACCESS_KEY: 'unsplash-key',
  NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
};

function authed(path, init = {}) {
  return new Request('https://worker.test' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer admin-token',
      ...(init.headers || {}),
    },
  });
}

function articleDoc(overrides = {}) {
  const fields = {
    title: { stringValue: 'AI search goes mainstream in India' },
    webflowItemId: { stringValue: 'wf-news-1' },
    contentType: { stringValue: 'news_brief' },
    ...overrides,
  };
  return {
    name: 'projects/wocult-tasks/databases/(default)/documents/articles/article-1',
    fields,
  };
}

function imageForm(overrides = {}) {
  const form = new FormData();
  form.set('firebaseDocId', 'article-1');
  form.set('webflowItemId', 'wf-news-1');
  form.set('filename', 'wocult-ai-search-goes-mainstream-in-india-a7k3.jpg');
  form.set('headline', 'AI search goes mainstream in India');
  form.set('altText', 'AI search goes mainstream in India');
  form.set('imageSource', 'unsplash');
  form.set('imageRequestId', 'article-1:unsplash-1:wocult-ai-search-goes-mainstream-in-india-a7k3.jpg');
  form.set('unsplashMetadata', JSON.stringify({
    unsplashPhotoId: 'unsplash-1',
    unsplashPhotographerName: 'Photographer',
    unsplashPhotographerUrl: 'https://unsplash.com/@photo',
    unsplashAttributionUrl: 'https://unsplash.com/photos/unsplash-1',
    unsplashDownloadLocation: 'https://api.unsplash.com/photos/unsplash-1/download',
  }));
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);
  form.set('file', new File([jpeg], 'image.jpg', { type: 'image/jpeg' }));
  Object.entries(overrides).forEach(([key, value]) => form.set(key, value));
  return form;
}

test('valid staff token can search Unsplash without returning the key', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      results: [{
        id: 'photo-1',
        width: 1600,
        height: 900,
        urls: { small: 'https://images.unsplash.com/small.jpg', raw: 'https://images.unsplash.com/raw.jpg' },
        user: { name: 'Photographer', links: { html: 'https://unsplash.com/@photo' } },
        links: { html: 'https://unsplash.com/photos/photo-1', download_location: 'https://api.unsplash.com/photos/photo-1/download' },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const res = await worker.fetch(authed('/news-briefs/unsplash-search?q=Indian%20smartphone%20users', { method: 'GET' }), env);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.results[0].unsplashPhotoId, 'photo-1');
  assert.equal(JSON.stringify(body).includes('unsplash-key'), false);
  assert.match(calls[0].url, /query=Indian\+smartphone\+users/);
  assert.equal(calls[0].options.headers.Authorization, 'Client-ID unsplash-key');
});

test('unauthenticated Unsplash search and image upload are blocked with CORS', async () => {
  const search = await worker.fetch(new Request('https://worker.test/news-briefs/unsplash-search?q=test', { method: 'GET' }), env);
  assert.equal(search.status, 401);
  assert.equal(search.headers.get('Access-Control-Allow-Origin'), '*');

  const upload = await worker.fetch(new Request('https://worker.test/news-briefs/image', { method: 'POST', body: imageForm() }), env);
  assert.equal(upload.status, 401);
  assert.equal(upload.headers.get('Access-Control-Allow-Origin'), '*');
});

test('image route uploads one Webflow asset, updates existing item and writes Firebase metadata', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const entry = { url: String(url), options };
    calls.push(entry);
    if (entry.url.includes('/documents/articles/article-1') && options.method !== 'PATCH') {
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url.includes('/documents/articles/article-1') && options.method === 'PATCH') {
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://api.webflow.com/v2/sites/site-1/assets') {
      return new Response(JSON.stringify({
        id: 'asset-1',
        uploadUrl: 'https://uploads.webflow.com/asset-1',
        hostedUrl: 'https://cdn.webflow.com/asset-1.jpg',
        uploadDetails: { key: 'asset-key', success_action_status: '201' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://uploads.webflow.com/asset-1') {
      return new Response('', { status: 201 });
    }
    if (entry.url === 'https://api.webflow.com/v2/assets/asset-1') {
      return new Response(JSON.stringify({ id: 'asset-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url.includes('/collections/news-collection/items/wf-news-1')) {
      return new Response(JSON.stringify({ id: 'wf-news-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://api.unsplash.com/photos/unsplash-1/download') {
      return new Response('{}', { status: 200 });
    }
    throw new Error('Unexpected fetch ' + entry.url);
  });

  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), env);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.webflowAssetId, 'asset-1');
  assert.equal(body.webflowImageUrl, 'https://cdn.webflow.com/asset-1.jpg');
  assert.equal(calls.filter((c) => c.url === 'https://api.webflow.com/v2/sites/site-1/assets').length, 1);
  assert.equal(calls.some((c) => c.url.includes('/collections/news-collection/items/wf-news-1')), true);
  assert.equal(calls.some((c) => c.url.includes('/collections/news-collection/items') && !c.url.includes('wf-news-1')), false);
  const webflowPatch = calls.find((c) => c.url.includes('/collections/news-collection/items/wf-news-1'));
  const webflowBody = JSON.parse(webflowPatch.options.body);
  assert.equal(webflowBody.fieldData['news-image'].fileId, 'asset-1');
  assert.equal(webflowBody.fieldData['image-source'], 'unsplash');
  assert.equal(webflowBody.fieldData['image-attribution'], 'Photo by Photographer on Unsplash');
  assert.equal(webflowBody.fieldData['image-photographer-link'], 'https://unsplash.com/@photo');
  assert.equal(webflowBody.fieldData['image-source-link'], 'https://unsplash.com/photos/unsplash-1');
  const finalPatch = calls.filter((c) => c.url.includes('/documents/articles/article-1') && c.options.method === 'PATCH').pop();
  assert.match(finalPatch.options.body, /"imageStatus"/);
  assert.match(finalPatch.options.body, /"completed"/);
  assert.match(finalPatch.options.body, /"webflowAssetId"/);
  assert.match(finalPatch.options.body, /"imageAttribution"/);
  assert.match(finalPatch.options.body, /Photo by Photographer on Unsplash/);
});

test('explicit article purpose behaves like the default article image route', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const entry = { url: String(url), options };
    calls.push(entry);
    if (entry.url.includes('/documents/articles/article-1')) {
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://api.webflow.com/v2/sites/site-1/assets') {
      return new Response(JSON.stringify({
        id: 'asset-article-explicit',
        uploadUrl: 'https://uploads.webflow.com/asset-article-explicit',
        hostedUrl: 'https://cdn.webflow.com/article-explicit.jpg',
        uploadDetails: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://uploads.webflow.com/asset-article-explicit') return new Response('', { status: 201 });
    if (entry.url === 'https://api.webflow.com/v2/assets/asset-article-explicit') return new Response('{}', { status: 200 });
    if (entry.url.includes('/collections/news-collection/items/wf-news-1')) return new Response(JSON.stringify({ id: 'wf-news-1' }), { status: 200 });
    if (entry.url === 'https://api.unsplash.com/photos/unsplash-1/download') return new Response('{}', { status: 200 });
    throw new Error('Unexpected fetch ' + entry.url);
  });

  const res = await worker.fetch(authed('/news-briefs/image', {
    method: 'POST',
    body: imageForm({ purpose: 'article' }),
  }), env);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.purpose, 'article');
  assert.equal(calls.some((c) => c.url.includes('/collections/news-collection/items/wf-news-1')), true);
  const finalPatch = calls.filter((c) => c.url.includes('/documents/articles/article-1') && c.options.method === 'PATCH').pop();
  assert.match(finalPatch.options.body, /"imageStatus"/);
  assert.match(finalPatch.options.body, /"webflowAssetId"/);
  assert.doesNotMatch(finalPatch.options.body, /"socialImageAssetId"/);
});

test('image route rejects unsupported purpose values before Firebase or Webflow calls', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    throw new Error('Invalid purpose should not call external services');
  });
  const res = await worker.fetch(authed('/news-briefs/image', {
    method: 'POST',
    body: imageForm({ purpose: 'avatar' }),
  }), env);
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'Invalid image purpose');
  assert.equal(calls.length, 0);
});

test('social image purpose is no longer accepted by the article image route', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    throw new Error('Social purpose should be rejected before external calls');
  });
  const res = await worker.fetch(authed('/news-briefs/image', {
    method: 'POST',
    body: imageForm({ purpose: 'social' }),
  }), env);
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'Invalid image purpose');
  assert.equal(calls.length, 0);
});

test('computer upload writes upload source and clears Unsplash attribution fields', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const entry = { url: String(url), options };
    calls.push(entry);
    if (entry.url.includes('/documents/articles/article-1')) {
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://api.webflow.com/v2/sites/site-1/assets') {
      return new Response(JSON.stringify({
        id: 'asset-1',
        uploadUrl: 'https://uploads.webflow.com/asset-1',
        hostedUrl: 'https://cdn.webflow.com/asset-1.jpg',
        uploadDetails: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://uploads.webflow.com/asset-1') return new Response('', { status: 201 });
    if (entry.url === 'https://api.webflow.com/v2/assets/asset-1') return new Response('{}', { status: 200 });
    if (entry.url.includes('/collections/news-collection/items/wf-news-1')) return new Response(JSON.stringify({ id: 'wf-news-1' }), { status: 200 });
    throw new Error('Unexpected fetch ' + entry.url);
  });

  const res = await worker.fetch(authed('/news-briefs/image', {
    method: 'POST',
    body: imageForm({ imageSource: 'uploaded', unsplashMetadata: '{}' }),
  }), env);
  assert.equal(res.status, 200);
  const webflowPatch = calls.find((c) => c.url.includes('/collections/news-collection/items/wf-news-1'));
  const webflowBody = JSON.parse(webflowPatch.options.body);
  assert.equal(webflowBody.fieldData['image-source'], 'upload');
  assert.equal(webflowBody.fieldData['image-attribution'], '');
  assert.equal(webflowBody.fieldData['image-photographer-link'], '');
  assert.equal(webflowBody.fieldData['image-source-link'], '');
  assert.equal(calls.some((c) => c.url.includes('/photos/unsplash-1/download')), false);
});

test('missing optional Unsplash attribution metadata does not crash image upload', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const entry = { url: String(url), options };
    calls.push(entry);
    if (entry.url.includes('/documents/articles/article-1')) {
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://api.webflow.com/v2/sites/site-1/assets') {
      return new Response(JSON.stringify({
        id: 'asset-1',
        uploadUrl: 'https://uploads.webflow.com/asset-1',
        hostedUrl: 'https://cdn.webflow.com/asset-1.jpg',
        uploadDetails: {},
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://uploads.webflow.com/asset-1') return new Response('', { status: 201 });
    if (entry.url === 'https://api.webflow.com/v2/assets/asset-1') return new Response('{}', { status: 200 });
    if (entry.url.includes('/collections/news-collection/items/wf-news-1')) return new Response(JSON.stringify({ id: 'wf-news-1' }), { status: 200 });
    throw new Error('Unexpected fetch ' + entry.url);
  });
  const res = await worker.fetch(authed('/news-briefs/image', {
    method: 'POST',
    body: imageForm({ unsplashMetadata: '{}' }),
  }), env);
  assert.equal(res.status, 200);
  const webflowPatch = calls.find((c) => c.url.includes('/collections/news-collection/items/wf-news-1'));
  const webflowBody = JSON.parse(webflowPatch.options.body);
  assert.equal(webflowBody.fieldData['image-source'], 'unsplash');
  assert.equal(webflowBody.fieldData['image-attribution'], '');
  assert.equal(webflowBody.fieldData['image-photographer-link'], '');
  assert.equal(webflowBody.fieldData['image-source-link'], '');
});

test('image route rejects invalid file before Webflow', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/documents/articles/article-1')) {
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected Webflow call');
  });
  const form = imageForm();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'bad.png', { type: 'image/png' }));
  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: form }), env);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('Firebase document and Webflow item IDs must match', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url).includes('/documents/articles/article-1') && options.method !== 'PATCH') {
      return new Response(JSON.stringify(articleDoc({ webflowItemId: { stringValue: 'different-item' } })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected fetch after mismatch');
  });
  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), env);
  assert.equal(res.status, 409);
});

test('idempotent retry returns existing asset without new Webflow calls', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(articleDoc({
      imageStatus: { stringValue: 'completed' },
      imageRequestId: { stringValue: 'article-1:unsplash-1:wocult-ai-search-goes-mainstream-in-india-a7k3.jpg' },
      webflowAssetId: { stringValue: 'asset-1' },
      webflowImageUrl: { stringValue: 'https://cdn.webflow.com/asset-1.jpg' },
      imageFilename: { stringValue: 'wocult-ai-search-goes-mainstream-in-india-a7k3.jpg' },
    })), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), env);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.idempotent, true);
  assert.equal(calls.length, 1);
});

