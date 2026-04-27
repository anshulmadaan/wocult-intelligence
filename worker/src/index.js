export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // /generate — proxy to Anthropic
    if (url.pathname === '/generate') {
      try {
        const body = await request.json();

// Fetch editorial brief from Firebase
let editorialBrief = '';

try {
  const briefType = body.briefType || 'generation';

  // Remove briefType before forwarding body to Anthropic
  delete body.briefType;

  const fbRes = await fetch(
    'https://firestore.googleapis.com/v1/projects/wocult-tasks/databases/(default)/documents/editorial_config/editorial_brief'
  );

  const fbData = await fbRes.json();
  const fields = fbData.fields || {};

  editorialBrief = fields[briefType]?.stringValue || '';
} catch (e) {
  // Brief fetch failed silently — generation continues without it
}

// Prepend brief to first user message if brief exists
if (editorialBrief && body.messages?.length) {
  const first = body.messages[0];

  if (first.role === 'user') {
    if (typeof first.content === 'string') {
      body.messages[0] = {
        ...first,
        content: editorialBrief + '\n\n' + first.content,
      };
    } else if (Array.isArray(first.content)) {
      const firstTextIndex = first.content.findIndex(
        (block) => block.type === 'text' && typeof block.text === 'string'
      );

      if (firstTextIndex >= 0) {
        const updatedContent = [...first.content];

        updatedContent[firstTextIndex] = {
          ...updatedContent[firstTextIndex],
          text: editorialBrief + '\n\n' + updatedContent[firstTextIndex].text,
        };

        body.messages[0] = {
          ...first,
          content: updatedContent,
        };
      }
    }
  }
}

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'web-search-2025-03-05',
          },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        return jsonResponse(data, res.status);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // /webflow — proxy to Webflow API
    if (url.pathname === '/webflow') {
      try {
        const body = await request.json();

        const res = await fetch(
          'https://api.webflow.com/v2/collections/695be252bae2cf37c3a4b17b/items',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + env.WEBFLOW_TOKEN,
              'accept': 'application/json',
            },
            body: JSON.stringify(body),
          }
        );

        const data = await res.json();
        return jsonResponse(data, res.status);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // /proxy — RSS proxy
    if (url.pathname === '/proxy') {
      const target = url.searchParams.get('url');

      if (!target) {
        return new Response('ERROR: Missing url parameter', {
          status: 400,
          headers: cors,
        });
      }

      try {
        const res = await fetch(target, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        const txt = await res.text();

        return new Response(txt, {
          status: res.status,
          headers: { ...cors, 'Content-Type': 'text/plain' },
        });
      } catch (e) {
        return new Response('ERROR: ' + e.message, {
          status: 500,
          headers: cors,
        });
      }
    }

    // /webflow-from-firebase — fetch doc from Firebase, push to Webflow
    if (url.pathname === '/webflow-from-firebase') {
      try {
        const { docId } = await request.json();

        if (!docId) {
          return jsonResponse({ error: 'Missing docId' }, 400);
        }

        const fbUrl = `https://firestore.googleapis.com/v1/projects/wocult-tasks/databases/(default)/documents/articles/${docId}`;

        const fbRes = await fetch(fbUrl);
        const fbData = await fbRes.json();

        const f = fbData.fields || {};
        const g = (k) => f[k]?.stringValue || '';

        const fieldData = {
          name: g('title'),
          slug: g('slug'),
          excerpt: g('excerpt'),
          'story-intro-para': g('shortIntro'),
          'short-story-intro': g('shortIntro'),
          '40-word-intro': g('intro40'),
          body: g('body'),
          'read-time': g('readTime'),
          'publish-date': g('publishDate')
            ? new Date(g('publishDate')).toISOString()
            : new Date().toISOString(),
        };

        const wfRes = await fetch(
          'https://api.webflow.com/v2/collections/695be252bae2cf37c3a4b17b/items',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + env.WEBFLOW_TOKEN,
              'accept': 'application/json',
            },
            body: JSON.stringify({
              fieldData,
              isDraft: true,
              isArchived: false,
            }),
          }
        );

        const wfData = await wfRes.json();
        return jsonResponse(wfData, wfRes.status);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // /debug — local check for env values without exposing keys
    if (url.pathname === '/debug') {
      return jsonResponse({
        hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
        hasWebflowToken: Boolean(env.WEBFLOW_TOKEN),
        hasNewsDataKey: Boolean(env.NEWSDATA_API_KEY),
        newsDataKeyStartsWithPub: env.NEWSDATA_API_KEY
          ? env.NEWSDATA_API_KEY.startsWith('pub_')
          : false,
      });
    }

    // Default route — NewsData.io
    const rawQ = url.searchParams.get('q');
    const q = rawQ && rawQ.trim() ? rawQ.trim() : 'india workforce hiring layoffs';

    // Local query debug. Does not expose API key.
    if (url.searchParams.get('debug') === '1') {
      return jsonResponse({
        rawQ,
        finalQ: q,
        hasNewsDataKey: Boolean(env.NEWSDATA_API_KEY),
        keyStartsWithPub: env.NEWSDATA_API_KEY
          ? env.NEWSDATA_API_KEY.startsWith('pub_')
          : false,
      });
    }

    const ndUrl = new URL('https://newsdata.io/api/1/latest');
    ndUrl.searchParams.set('apikey', env.NEWSDATA_API_KEY || '');
    ndUrl.searchParams.set('q', q);
    ndUrl.searchParams.set('country', 'in');
    ndUrl.searchParams.set('language', 'en');
    ndUrl.searchParams.set('size', '10');

    try {
      const res = await fetch(ndUrl.toString());
      const data = await res.json();

      return jsonResponse(data, res.status);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  },
};