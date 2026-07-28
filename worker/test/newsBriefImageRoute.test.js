import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  WORKER_ADMIN_TOKEN: 'admin-token',
  WEBFLOW_TOKEN: 'webflow-token',
  WEBFLOW_SITE_ID: 'site-1',
  WEBFLOW_NEWS_COLLECTION_ID: 'news-collection',
  FIREBASE_PROJECT_ID: 'wocult-tasks',
  FIREBASE_WEB_API_KEY: 'firebase-web-api-key',
  FIREBASE_ACCESS_TOKEN: 'firebase-access-token',
  UNSPLASH_ACCESS_KEY: 'unsplash-key',
  NEWS_BRIEF_MAX_ITEMS_PER_RUN: '1',
};

function arrayBufferToBase64(buffer) {
  return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

function pemFromPkcs8(buffer) {
  const b64 = arrayBufferToBase64(buffer).replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
}

async function serviceAccountEnv(overrides = {}) {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    ...env,
    FIREBASE_ACCESS_TOKEN: '',
    FIREBASE_CLIENT_EMAIL: 'image-uploader@wocult-tasks.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: pemFromPkcs8(pkcs8),
    ...overrides,
  };
}

function decodeJwtPayload(assertion) {
  const payload = String(assertion || '').split('.')[1] || '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

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
  form.set('finalWidth', '1200');
  form.set('finalHeight', '630');
  form.set('sourceWidth', '1600');
  form.set('sourceHeight', '900');
  form.set('finalFormat', 'image/jpeg');
  form.set('finalFileSize', '9');
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

function previewImageForm(overrides = {}) {
  const form = new FormData();
  form.set('templateId', 'template1');
  form.set('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])], 'preview.png', { type: 'image/png' }));
  Object.entries(overrides).forEach(([key, value]) => form.set(key, value));
  return form;
}

function firebaseAuthed(path, init = {}, token = 'firebase-id-token') {
  return new Request('https://worker.test' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(init.headers || {}),
    },
  });
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

test('admin Canva preview upload rejects unauthenticated users', async () => {
  const res = await worker.fetch(new Request('https://worker.test/admin/canva-template-preview-image', {
    method: 'POST',
    body: previewImageForm(),
  }), env);
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error, 'Unauthorized');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('admin Canva preview upload rejects authenticated non-admin users', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ email: 'staff@example.com', localId: 'staff-1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Non-admin request must not reach Webflow');
  });
  const res = await worker.fetch(firebaseAuthed('/admin/canva-template-preview-image', {
    method: 'POST',
    body: previewImageForm(),
  }), env);
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.equal(body.error, 'Forbidden');
  assert.equal(calls.length, 1);
});

test('admin Canva preview upload accepts verified admin user and returns permanent Webflow URL', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      assert.equal(JSON.parse(options.body).idToken, 'firebase-id-token');
      return new Response(JSON.stringify({ users: [{ email: 'anmadaan@gmail.com', localId: 'admin-1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url) === 'https://api.webflow.com/v2/sites/site-1/assets') {
      const body = JSON.parse(options.body);
      assert.match(body.fileName, /^wocult-canva-template1-\d+\.png$/);
      return new Response(JSON.stringify({
        id: 'admin-asset-1',
        uploadUrl: 'https://uploads.webflow.com/admin-asset-1',
        hostedUrl: 'https://cdn.webflow.com/admin-asset-1.png',
        uploadDetails: { key: 'asset-key' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url) === 'https://uploads.webflow.com/admin-asset-1') return new Response('', { status: 201 });
    if (String(url) === 'https://api.webflow.com/v2/assets/admin-asset-1') return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    throw new Error('Unexpected fetch: ' + url);
  });
  const res = await worker.fetch(firebaseAuthed('/admin/canva-template-preview-image', {
    method: 'POST',
    body: previewImageForm(),
  }), env);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.webflowAssetId, 'admin-asset-1');
  assert.equal(body.previewImageUrl, 'https://cdn.webflow.com/admin-asset-1.png');
  assert.equal(calls.some((call) => call.url.includes('/documents/articles/')), false);
});

test('admin Canva preview upload rejects SVG and spoofed image content before Webflow', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
      return new Response(JSON.stringify({ users: [{ email: 'anmadaan@gmail.com', localId: 'admin-1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Invalid preview image must not reach Webflow');
  });
  const svg = await worker.fetch(firebaseAuthed('/admin/canva-template-preview-image', {
    method: 'POST',
    body: previewImageForm({ file: new File(['<svg><script>alert(1)</script></svg>'], 'preview.svg', { type: 'image/svg+xml' }) }),
  }), env);
  assert.equal(svg.status, 400);
  assert.equal((await svg.json()).error, 'Preview image must be JPEG, PNG or WebP');

  const spoofed = await worker.fetch(firebaseAuthed('/admin/canva-template-preview-image', {
    method: 'POST',
    body: previewImageForm({ file: new File(['<html><script>alert(1)</script></html>'], 'preview.png', { type: 'image/png' }) }),
  }), env);
  assert.equal(spoofed.status, 400);
  assert.equal((await spoofed.json()).error, 'Preview image content does not match its file type');
  assert.equal(calls.filter((call) => call.url === 'https://api.webflow.com/v2/sites/site-1/assets').length, 0);
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
  const firestoreRead = calls.find((c) => c.url.includes('/documents/articles/article-1') && c.options.method !== 'PATCH');
  assert.equal(firestoreRead.options.headers.Authorization, 'Bearer firebase-access-token');
  assert.equal(calls.some((c) => c.url === 'https://oauth2.googleapis.com/token'), false);
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

test('image route uses service-account OAuth when FIREBASE_ACCESS_TOKEN is absent', async (t) => {
  const baseServiceEnv = await serviceAccountEnv();
  const uploadEnv = {
    ...baseServiceEnv,
    FIREBASE_PRIVATE_KEY: baseServiceEnv.FIREBASE_PRIVATE_KEY.replace(/\n/g, '\\n'),
  };
  const calls = [];
  let jwtAssertion = '';
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const entry = { url: String(url), options };
    calls.push(entry);
    if (entry.url === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(options.body);
      jwtAssertion = params.get('assertion') || '';
      const payload = decodeJwtPayload(jwtAssertion);
      assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.equal(payload.iss, uploadEnv.FIREBASE_CLIENT_EMAIL);
      assert.equal(payload.scope, 'https://www.googleapis.com/auth/datastore');
      assert.equal(payload.aud, 'https://oauth2.googleapis.com/token');
      return new Response(JSON.stringify({ access_token: 'oauth-access-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url.includes('/documents/articles/article-1') && options.method !== 'PATCH') {
      assert.equal(options.headers.Authorization, 'Bearer oauth-access-token');
      return new Response(JSON.stringify(articleDoc()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url.includes('/documents/articles/article-1') && options.method === 'PATCH') {
      assert.equal(options.headers.Authorization, 'Bearer oauth-access-token');
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
    if (entry.url === 'https://uploads.webflow.com/asset-1') return new Response('', { status: 201 });
    if (entry.url === 'https://api.webflow.com/v2/assets/asset-1') return new Response(JSON.stringify({ id: 'asset-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (entry.url.includes('/collections/news-collection/items/wf-news-1')) return new Response(JSON.stringify({ id: 'wf-news-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (entry.url === 'https://api.unsplash.com/photos/unsplash-1/download') return new Response('{}', { status: 200 });
    throw new Error('Unexpected fetch ' + entry.url);
  });

  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), uploadEnv);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.webflowImageUrl, 'https://cdn.webflow.com/asset-1.jpg');
  assert.ok(calls.filter((c) => c.url === 'https://oauth2.googleapis.com/token').length >= 1);
  const responseText = JSON.stringify(body);
  assert.equal(responseText.includes('oauth-access-token'), false);
  assert.equal(responseText.includes(jwtAssertion), false);
  assert.equal(responseText.includes(uploadEnv.FIREBASE_PRIVATE_KEY), false);
});

test('image route reports missing service-account secrets precisely', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    throw new Error('Missing service account should not call external services');
  });
  const uploadEnv = {
    ...env,
    FIREBASE_ACCESS_TOKEN: '',
    FIREBASE_CLIENT_EMAIL: '',
    FIREBASE_PRIVATE_KEY: '',
  };
  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), uploadEnv);
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.equal(body.error, 'Firebase service-account secrets are required for image upload');
  assert.equal(calls.length, 0);
});

test('image route reports OAuth token exchange failure without exposing secrets', async (t) => {
  const uploadEnv = await serviceAccountEnv();
  let jwtAssertion = '';
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      jwtAssertion = new URLSearchParams(options.body).get('assertion') || '';
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('OAuth failure should stop before Firestore or Webflow');
  });
  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), uploadEnv);
  const body = await res.json();
  const responseText = JSON.stringify(body);
  assert.equal(res.status, 500);
  assert.equal(body.error, 'Firebase OAuth token exchange failed: invalid_grant');
  assert.equal(responseText.includes(uploadEnv.FIREBASE_PRIVATE_KEY), false);
  assert.equal(responseText.includes(jwtAssertion), false);
  assert.equal(responseText.includes('access_token'), false);
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

test('image route rejects images that fail News Brief final image requirements before external calls', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    throw new Error('Invalid prepared image must not call external services');
  });

  const wrongDimensions = imageForm({ finalWidth: '1199', finalHeight: '630' });
  const wrongDimensionsRes = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: wrongDimensions }), env);
  assert.equal(wrongDimensionsRes.status, 400);
  assert.equal((await wrongDimensionsRes.json()).error, 'Processed image must be exactly 1200 x 630 pixels');

  const smallSource = imageForm({ sourceWidth: '1199' });
  const smallSourceRes = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: smallSource }), env);
  assert.equal(smallSourceRes.status, 400);
  assert.equal((await smallSourceRes.json()).error, 'Source image width must be at least 1200 pixels');

  const large = new Uint8Array(200 * 1024);
  large[0] = 0xff; large[1] = 0xd8; large[2] = 0xff; large[large.length - 1] = 0xd9;
  const largeForm = imageForm({ finalFileSize: String(large.length) });
  largeForm.set('file', new File([large], 'image.jpg', { type: 'image/jpeg' }));
  const largeRes = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: largeForm }), env);
  assert.equal(largeRes.status, 400);
  assert.equal((await largeRes.json()).error, 'Processed JPEG must be below 200 KB');
  assert.equal(calls.length, 0);
});

test('image route stores 1200 by 630 metadata for accepted News Brief images', async (t) => {
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
      return new Response(JSON.stringify({ id: 'asset-1', uploadUrl: 'https://uploads.webflow.com/asset-1', hostedUrl: 'https://cdn.webflow.com/asset-1.jpg', uploadDetails: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (entry.url === 'https://uploads.webflow.com/asset-1') return new Response('', { status: 201 });
    if (entry.url === 'https://api.webflow.com/v2/assets/asset-1') return new Response('{}', { status: 200 });
    if (entry.url.includes('/collections/news-collection/items/wf-news-1')) return new Response(JSON.stringify({ id: 'wf-news-1' }), { status: 200 });
    if (entry.url === 'https://api.unsplash.com/photos/unsplash-1/download') return new Response('{}', { status: 200 });
    throw new Error('Unexpected fetch ' + entry.url);
  });
  const res = await worker.fetch(authed('/news-briefs/image', { method: 'POST', body: imageForm() }), env);
  assert.equal(res.status, 200);
  const finalPatch = calls.filter((c) => c.url.includes('/documents/articles/article-1') && c.options.method === 'PATCH').pop();
  assert.match(finalPatch.options.body, /"imageWidth"/);
  assert.match(finalPatch.options.body, /"1200"/);
  assert.match(finalPatch.options.body, /"imageHeight"/);
  assert.match(finalPatch.options.body, /"630"/);
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

