import {
  handleAutomationRequest,
  runNewsBriefCandidateWorkflow,
  runNewsBriefFinalizerWorkflow,
  runNewsBriefCoordinatorWorkflow,
  runNewsBriefAutomation,
  requireProtectedRoute,
  scheduledNewsBriefAutomation,
} from './newsBriefAutomation.js';

const { WorkflowEntrypoint: CloudflareWorkflowEntrypoint = class {} } =
  await import('cloudflare:workers').catch(() => ({}));

export class NewsBriefAutomationWorkflow extends CloudflareWorkflowEntrypoint {
  async run(event, step) {
    const payload = event?.payload || {};
    const runId = payload.runId || '';
    return runNewsBriefCoordinatorWorkflow(this.env, {
      triggerType: payload.triggerType || 'dashboard_dry_run',
      dryRun: payload.dryRun,
      requestRunId: runId,
      coordinatorWorkflowInstanceId: event?.instanceId || runId,
      fromWorkflow: true,
    }, { workflowStep: step });
  }
}

export class NewsBriefCandidateWorkflow extends CloudflareWorkflowEntrypoint {
  async run(event, step) {
    return runNewsBriefCandidateWorkflow(this.env, {
      ...(event?.payload || {}),
      workflowInstanceId: event?.instanceId || event?.payload?.workflowInstanceId || '',
    }, { workflowStep: step });
  }
}

export class NewsBriefRunFinalizerWorkflow extends CloudflareWorkflowEntrypoint {
  async run(event, step) {
    return runNewsBriefFinalizerWorkflow(this.env, {
      ...(event?.payload || {}),
      workflowInstanceId: event?.instanceId || event?.payload?.workflowInstanceId || '',
    }, { workflowStep: step });
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduledNewsBriefAutomation(env, ctx));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    };

    const NEWS_COLLECTION_ID = '6a4d6ad32871d46ed1edc6a4';
    const NEWS_BEAT_OPTIONS = {
      companies: '26b338ed973fe5a8e9723ee27c3cab91',
      'new jobs': '8a9188ad0192ce310bd9257582c1023b',
      layoffs: '86e2769a55224948009e72cd807be288',
      'pay and benefits': 'd7848449825b79b04c003d8099ec052c',
      'ai at work': '3710b9c1e048787e8cbd898a0a33e53f',
      'policy and economy': '517b81d814d4420e12e5f16b1778758f',
      leadership: 'c2d8a432de6795e2b54a38f6cf528470',
      entrepreneurship: '227d8b629942ea8e036037b07637ee05',
      'workplac culture': '169e2cfd9c6726e4f3c9a9acdad2e19e',
      'workplace culture': '169e2cfd9c6726e4f3c9a9acdad2e19e',
      'diversity & inclusion': 'b64ca2853885e52d1fa5552e4bf2e274',
      'power & politics': '8bf0805fc2a0b74eae53e20f1c3450df',
      diaspora: '3db495c7e94bf389598c836d62788aea',
      'future of work': '5cc8138d132a38d9b3f56a158cf63694',
    };
    const normalizeNewsBeat = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (NEWS_BEAT_OPTIONS[raw]) return NEWS_BEAT_OPTIONS[raw];
      if (raw.includes('layoff') || raw.includes('redundan') || raw.includes('job cut')) return NEWS_BEAT_OPTIONS.layoffs;
      if (raw.includes('hir') || raw.includes('job')) return NEWS_BEAT_OPTIONS['new jobs'];
      if (raw.includes('pay') || raw.includes('salary') || raw.includes('benefit')) return NEWS_BEAT_OPTIONS['pay and benefits'];
      if (raw.includes('ai')) return NEWS_BEAT_OPTIONS['ai at work'];
      if (raw.includes('policy') || raw.includes('econom') || raw.includes('labour') || raw.includes('labor')) return NEWS_BEAT_OPTIONS['policy and economy'];
      if (raw.includes('wellbeing') || raw.includes('well-being') || raw.includes('safety')) return NEWS_BEAT_OPTIONS['workplace culture'];
      if (raw.includes('women') || raw.includes('gender') || raw.includes('diversity') || raw.includes('inclusion')) return NEWS_BEAT_OPTIONS['diversity & inclusion'];
      if (raw.includes('general workplace') || raw.includes('work culture') || raw.includes('workplace')) return NEWS_BEAT_OPTIONS['workplace culture'];
      if (raw.includes('leader')) return NEWS_BEAT_OPTIONS.leadership;
      if (raw.includes('compan')) return NEWS_BEAT_OPTIONS.companies;
      return NEWS_BEAT_OPTIONS['future of work'];
    };
    const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toSentenceCaseHeadline = (text) => {
      let s = String(text || '').trim().replace(/\s+/g, ' ');
      if (!s) return '';
      s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

      const preserve = ['AI','HR','CEO','CFO','CHRO','CTO','COO','CIO','IT','PF','EPF','EPFO','ESIC','POSH','TCS','HUL','RBI','SEBI','IPO','MSME','U.S.','US','UK','H-1B'];
      preserve.forEach((term) => {
        const re = new RegExp('\\b' + escapeRegExp(term) + '\\b', 'gi');
        s = s.replace(re, term);
      });

      return s;
    };
    function toWebflowDateTime(value) {
      const d = value ? new Date(value) : new Date();
      if (!d || Number.isNaN(d.getTime())) return new Date().toISOString();
      return d.toISOString();
    }
    const limitSeoDescription = (text) => {
      const s = String(text || '').replace(/\s+/g, ' ').trim();
      if (!s) return '';
      if (s.length <= 249) return s;
      let cut = s.slice(0, 246);
      const lastSpace = cut.lastIndexOf(' ');
      if (lastSpace > 160) cut = cut.slice(0, lastSpace);
      return cut.replace(/[.,;:!?-]+$/,'') + '...';
    };
    const stripEmptyOptionalFields = (fieldData) => {
      const cleaned = {};
      for (const [key, value] of Object.entries(fieldData)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && !value.trim() && key !== 'name' && key !== 'slug') continue;
        cleaned[key] = value;
      }
      return cleaned;
    };
    const buildNewsFieldData = (payload) => {
      const data = payload.fieldData || payload;
      const title = toSentenceCaseHeadline(data.title || data.name);
      const publishedDate = toWebflowDateTime(data.publishedDate || data.publishDate || data.date || data['published-date'] || data['publish-date'] || new Date());
      const seoDescription = limitSeoDescription(data.seoDescription || data['seo-description'] || data.standfirst || data.excerpt || data.shortIntro || data['short-story-intro'] || '');
      return stripEmptyOptionalFields({
        name: title,
        slug: data.slug,
        standfirst: data.standfirst || data.shortIntro || data['short-story-intro'] || data['story-intro-para'] || data.excerpt || '',
        body: data.body || '',
        beat: normalizeNewsBeat(data.beat || data.category || data.cat || 'Future of Work'),
        'published-date': publishedDate,
        'source-name': data.sourceName || data['source-name'] || data.sourceTitle || data['source-title'] || data.source || '',
        'source-url': data.sourceUrl || data.sourceURL || data['source-url'] || data.url || '',
        'seo-description': seoDescription,
        'news-image': data.image || data.imageUrl || data.coverImageUrl || data['news-image'] || '',
      });
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const automationResponse = await handleAutomationRequest(request, env, null, { cors, jsonResponse });
    if (automationResponse) return automationResponse;

    // /generate — proxy to Anthropic, with Firebase editorial brief injection
    if (url.pathname === '/generate') {
      try {
        const body = await request.json();

        // Debug flag: confirms Firebase brief injection without calling Anthropic
        const debugBrief = body.debugBrief === true;
        delete body.debugBrief;

        // Which Firebase prompt to use: generation, scratch, refine, etc.
        const briefType = body.briefType || 'generation';

        // Remove briefType before forwarding request to Anthropic
        delete body.briefType;

        // Fetch editorial brief from Firebase
        let editorialBrief = '';
        let briefInserted = false;

        try {
          const fbRes = await fetch(
            'https://firestore.googleapis.com/v1/projects/wocult-tasks/databases/(default)/documents/editorial_config/editorial_brief'
          );

          const fbData = await fbRes.json();
          const fields = fbData.fields || {};

          editorialBrief = fields[briefType]?.stringValue || '';
        } catch (e) {
          // Brief fetch failed silently — generation continues without it
          editorialBrief = '';
        }

        // Prepend Firebase brief to first user message if brief exists
        if (editorialBrief && body.messages?.length) {
          const first = body.messages[0];

          if (first.role === 'user') {
            if (typeof first.content === 'string') {
              body.messages[0] = {
                ...first,
                content: editorialBrief + '\n\n' + first.content,
              };

              briefInserted = true;
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

                briefInserted = true;
              }
            }
          }
        }

        // Debug proof without calling Anthropic or exposing full prompt
        if (debugBrief) {
          return jsonResponse({
            debugMode: true,
            briefType,
            briefFound: Boolean(editorialBrief),
            briefInserted,
            editorialBriefLength: editorialBrief.length,
            messageCount: body.messages?.length || 0,
          });
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
      const unauthorized = await requireProtectedRoute(request, env);
      if (unauthorized) return unauthorized;
      try {
        const body = await request.json();

        const res = await fetch(
          'https://api.webflow.com/v2/collections/695be252bae2cf37c3a4b17b/items',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN),
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

    // /webflow-news - proxy to Webflow News collection
    if (url.pathname === '/webflow-news') {
      const unauthorized = await requireProtectedRoute(request, env);
      if (unauthorized) return unauthorized;
      try {
        const body = await request.json();
        const newsFieldData = buildNewsFieldData(body);

        const webflowRes = await fetch(
          `https://api.webflow.com/v2/collections/${env.WEBFLOW_NEWS_COLLECTION_ID || NEWS_COLLECTION_ID}/items`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN),
              'accept': 'application/json',
            },
            body: JSON.stringify({
              fieldData: newsFieldData,
              isDraft: body.isDraft !== false,
              isArchived: body.isArchived === true,
            }),
          }
        );

        const webflowText = await webflowRes.text();
        let webflowData = null;

        try {
          webflowData = webflowText ? JSON.parse(webflowText) : null;
        } catch (e) {
          webflowData = { raw: webflowText };
        }

        if (!webflowRes.ok) {
          console.error('Webflow CMS error', {
            status: webflowRes.status,
            statusText: webflowRes.statusText,
            body: webflowText,
          });

          return jsonResponse(
            {
              ok: false,
              error: 'Webflow CMS validation failed',
              status: webflowRes.status,
              details: webflowData || webflowText,
            },
            400
          );
        }

        return jsonResponse(webflowData, webflowRes.status);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // /proxy — RSS proxy
    // /reddit - public Reddit JSON scan for workplace signals
    // /webflow-schema - debug Webflow collection field slugs
    if (url.pathname === '/webflow-schema') {
      const unauthorized = await requireProtectedRoute(request, env);
      if (unauthorized) return unauthorized;
      try {
        const collectionId = url.searchParams.get('collectionId') || NEWS_COLLECTION_ID;
        const schemaRes = await fetch(
          `https://api.webflow.com/v2/collections/${collectionId}`,
          {
            headers: {
              'Authorization': 'Bearer ' + (env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN),
              'accept': 'application/json',
            },
          }
        );
        const schemaText = await schemaRes.text();
        let schemaData = null;

        try {
          schemaData = schemaText ? JSON.parse(schemaText) : null;
        } catch (e) {
          schemaData = { raw: schemaText };
        }

        return jsonResponse(schemaData, schemaRes.status);
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (url.pathname === '/reddit') {
      const subreddits = [
        'jobs',
        'careerguidance',
        'recruitinghell',
        'antiwork',
        'humanresources',
        'AskHR',
        'cscareerquestions',
        'developersIndia',
        'india',
        'bangalore',
        'mumbai',
        'delhi',
      ];
      const keywords = [
        'layoff',
        'layoffs',
        'fired',
        'job cut',
        'hiring freeze',
        'offer revoked',
        'burnout',
        'toxic manager',
        'manager',
        'salary',
        'appraisal',
        'bonus',
        'promotion',
        'notice period',
        'resignation',
        'work from home',
        'wfh',
        'return to office',
        'hybrid',
        'PIP',
        'HR',
        'harassment',
        'workplace',
        'office politics',
        'career',
      ];
      const boostKeywords = new Set([
        'layoff',
        'layoffs',
        'fired',
        'burnout',
        'salary',
        'PIP',
        'toxic manager',
        'offer revoked',
        'return to office',
      ]);
      const headers = {
        'User-Agent': 'WocultIntelligence/1.0 by Wocult',
        'Accept': 'application/json',
      };
      const nowSeconds = Date.now() / 1000;
      let rawPostsFetched = 0;
      let postsAfterKeywordFilter = 0;
      let postsAfterQualityFilter = 0;
      const debug = subreddits.map((subreddit) => ({
        subreddit,
        hotStatus: null,
        topStatus: null,
        hotCount: 0,
        topCount: 0,
        error: '',
      }));
      const findKeyword = (title, selftext) => {
        const hay = `${title || ''} ${selftext || ''}`.toLowerCase();
        for (const keyword of keywords) {
          const k = keyword.toLowerCase();
          if (k === 'hr' || k === 'pip') {
            const re = new RegExp(`\\b${k}\\b`, 'i');
            if (re.test(hay)) return keyword;
          } else if (hay.includes(k)) {
            return keyword;
          }
        }
        return '';
      };
      const shortSnippet = (text) => {
        return String(text || '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220);
      };
      const fetchListing = async (subreddit, path, kind) => {
        const info = debug.find((row) => row.subreddit === subreddit);
        try {
          const res = await fetch(`https://www.reddit.com/r/${subreddit}/${path}`, { headers });
          if (info) info[`${kind}Status`] = res.status;
          if (!res.ok) {
            const text = await res.text();
            if (info) info.error = `${kind}: HTTP ${res.status} ${text.slice(0, 200)}`;
            return [];
          }
          const data = await res.json();
          const posts = data?.data?.children?.map((child) => child.data).filter(Boolean) || [];
          if (info) info[`${kind}Count`] = posts.length;
          rawPostsFetched += posts.length;
          return posts;
        } catch (e) {
          if (info) info.error = `${kind}: ${e.message}`;
          return [];
        }
      };

      try {
        const listings = await Promise.all(
          subreddits.flatMap((subreddit) => [
            fetchListing(subreddit, 'hot.json?limit=25', 'hot'),
            fetchListing(subreddit, 'top.json?t=day&limit=25', 'top'),
          ])
        );
        const seen = new Set();
        const results = [];

        for (const post of listings.flat()) {
          const id = post.id || post.name || post.permalink;
          if (!id || seen.has(id)) continue;
          seen.add(id);

          const title = String(post.title || '').trim();
          const selftext = String(post.selftext || '');
          if (!title || /^\[(deleted|removed)\]$/i.test(title)) continue;
          if (post.over_18) continue;
          if (/^\[(deleted|removed)\]$/i.test(selftext.trim())) continue;
          if (post.removed_by_category || post.banned_by) continue;

          const matchedKeyword = findKeyword(title, selftext);
          if (!matchedKeyword) continue;
          postsAfterKeywordFilter += 1;

          const score = Number(post.score || 0);
          const comments = Number(post.num_comments || 0);
          if (score < 10 && comments < 5) continue;
          postsAfterQualityFilter += 1;

          const ageHours = Math.max(0, (nowSeconds - Number(post.created_utc || nowSeconds)) / 3600);
          if (ageHours > 48 && comments < 100 && score < 250) continue;

          let heat = score + comments * 3;
          if (comments > 50) heat += 100;
          if (ageHours < 12) heat += 75;
          if (boostKeywords.has(matchedKeyword)) heat += 100;

          const permalink = post.permalink || '';
          results.push({
            id,
            title,
            subreddit: post.subreddit || '',
            score,
            comments,
            pub: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : new Date().toISOString(),
            link: permalink ? `https://www.reddit.com${permalink}` : `https://www.reddit.com/r/${post.subreddit || ''}/comments/${id}`,
            snippet: shortSnippet(selftext),
            matchedKeyword,
            heat,
          });
        }

        results.sort((a, b) => b.heat - a.heat);
        return jsonResponse({
          ok: true,
          subredditsChecked: subreddits.length,
          rawPostsFetched,
          postsAfterKeywordFilter,
          postsAfterQualityFilter,
          results,
          debug,
        });
      } catch (e) {
        return jsonResponse({
          ok: true,
          subredditsChecked: subreddits.length,
          rawPostsFetched,
          postsAfterKeywordFilter,
          postsAfterQualityFilter,
          results: [],
          debug,
          error: e.message,
        }, 200);
      }
    }

    // /official - official source-document alerts
    if (url.pathname === '/official') {
      const debug = [];
      const results = [];
      let rawItemsFetched = 0;
      const dropStats = {
        droppedNoDate: 0,
        droppedOld: 0,
        droppedNoCompanyMatch: 0,
        droppedNoAnnouncementKeyword: 0,
        droppedNoFilingType: 0,
        droppedNoFallbackKeyword: 0,
        keptPIB: 0,
        keptBSE: 0,
        keptSEC: 0,
        keptGoogleFallback: 0,
        dateParseFailures: 0,
      };
      const sampleDropped = [];
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 3600000;
      const headers = {
        'User-Agent': 'WocultIntelligence/1.0 by Wocult',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html',
      };
      const decode = (s = '') => String(s)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      const tag = (block, name) => {
        const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
        return m ? decode(m[1]) : '';
      };
      const linkFromBlock = (block) => {
        const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
        if (href) return decode(href[1]);
        return tag(block, 'link') || tag(block, 'guid');
      };
      const extractOfficialRawDate = (block) => {
        const direct = tag(block, 'pubDate') || tag(block, 'dc:date') || tag(block, 'date') || tag(block, 'updated') || tag(block, 'published');
        if (direct) return direct;
        const text = decode(block);
        const posted = text.match(/Posted On:\s*\d{1,2}\s+[A-Z]{3,}\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s+by PIB\s+[A-Za-z]+)?/i);
        if (posted) return posted[0];
        const pib = text.match(/\d{1,2}\s+[A-Z]{3,}\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?/i);
        return pib ? pib[0] : '';
      };
      const parseOfficialDate = (raw) => {
        if (!raw) return 0;
        let s = String(raw).trim();
        s = s.replace(/^Posted On:\s*/i, '');
        s = s.replace(/\s+by PIB.*$/i, '');
        s = s.replace(/\s+IST$/i, '');
        s = s.trim();
        const m = s.match(/(\d{1,2})\s+([A-Z]{3,})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
        if (m) {
          const day = parseInt(m[1], 10);
          const monName = m[2].toUpperCase().slice(0, 3);
          const year = parseInt(m[3], 10);
          let hour = m[4] ? parseInt(m[4], 10) : 0;
          const minute = m[5] ? parseInt(m[5], 10) : 0;
          const ampm = (m[6] || '').toUpperCase();
          const months = {
            JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
            JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
          };
          if (months[monName] !== undefined) {
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
            return Date.UTC(year, months[monName], day, hour - 5, minute - 30);
          }
        }
        const nativeTime = Date.parse(s);
        if (!Number.isNaN(nativeTime)) return nativeTime;
        return 0;
      };
      const extractPibDetailDate = (html) => {
        const dateBlock = html.match(/id=["']PrDateTime["'][^>]*>([\s\S]*?)<\/div>/i);
        if (dateBlock) {
          const dateText = decode(dateBlock[1]);
          const inBlock = dateText.match(/\d{1,2}\s+[A-Z]{3,}\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?(?:\s+by PIB\s+[A-Za-z]+)?/i);
          if (inBlock) return inBlock[0];
        }
        const text = decode(html);
        const posted = text.match(/Posted On:\s*\d{1,2}\s+[A-Z]{3,}\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s+by PIB\s+[A-Za-z]+)?/i);
        if (posted) return posted[0];
        const pib = text.match(/\d{1,2}\s+[A-Z]{3,}\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?(?:\s+by PIB\s+[A-Za-z]+)?/i);
        return pib ? pib[0] : '';
      };
      const fetchPibDetailDate = async (item) => {
        if (!item?.link) return '';
        const urls = [item.link];
        const prid = String(item.link).match(/[?&]PRID=([^&]+)/i);
        if (prid) {
          urls.push(`https://pib.gov.in/PressReleasePage.aspx?PRID=${prid[1]}`);
          urls.push(`https://pib.gov.in/PressReleaseIframePage.aspx?PRID=${prid[1]}`);
        }
        try {
          for (const detailUrl of Array.from(new Set(urls))) {
            const res = await fetch(detailUrl, { headers: { ...headers, 'Accept': 'text/html' } });
            const text = await res.text();
            if (!res.ok) continue;
            const date = extractPibDetailDate(text);
            if (date) return date;
          }
          return '';
        } catch (e) {
          return '';
        }
      };
      const parseFeed = (xml, fallbackSource) => {
        const out = [];
        const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
        itemBlocks.forEach((block) => out.push({
          title: tag(block, 'title'),
          link: linkFromBlock(block),
          pub: extractOfficialRawDate(block),
          snippet: tag(block, 'description') || tag(block, 'summary'),
          source: fallbackSource,
        }));
        const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
        entryBlocks.forEach((block) => out.push({
          title: tag(block, 'title'),
          link: linkFromBlock(block),
          pub: extractOfficialRawDate(block),
          snippet: tag(block, 'summary') || tag(block, 'content'),
          source: fallbackSource,
        }));
        return out.filter((item) => item.title && item.link);
      };
      const fetchText = async (source, targetUrl) => {
        const row = { source, url: targetUrl, status: null, count: 0, error: '' };
        debug.push(row);
        try {
          const res = await fetch(targetUrl, { headers });
          row.status = res.status;
          const text = await res.text();
          if (!res.ok) {
            row.error = `HTTP ${res.status} ${text.slice(0, 200)}`;
            return { text: '', row };
          }
          return { text, row };
        } catch (e) {
          row.error = e.message;
          return { text: '', row };
        }
      };
      const sampleDrop = (item, source, reason) => {
        if (sampleDropped.length >= 20) return;
        const rawDate = item?.pub || '';
        const parsedTime = parseOfficialDate(rawDate);
        sampleDropped.push({
          title: item?.title || '',
          source,
          rawDate,
          parsedDate: parsedTime ? new Date(parsedTime).toISOString() : '',
          parseSuccess: !!parsedTime,
          reason,
        });
      };
      const officialDateStatus = (item, source) => {
        const value = item?.pub || '';
        if (!value) {
          if (/PIB Labour|Ministry of Labour/i.test(source || '')) {
            dropStats.dateParseFailures += 1;
            return { keep: true, ms: now, parseFailed: true };
          }
          dropStats.droppedNoDate += 1;
          sampleDrop(item, source, 'no_date');
          return { keep: false, ms: 0, parseFailed: false };
        }
        const t = parseOfficialDate(value);
        if (!t || Number.isNaN(t)) {
          dropStats.dateParseFailures += 1;
          return { keep: true, ms: now, parseFailed: true };
        }
        if (now - t < 0) return { keep: true, ms: t, parseFailed: false };
        if (now - t > sevenDaysMs) {
          dropStats.droppedOld += 1;
          sampleDrop(item, source, 'older_than_7_days');
          return { keep: false, ms: t, parseFailed: false };
        }
        return { keep: true, ms: t, parseFailed: false };
      };
      const firstMatch = (hay, list) => {
        const lower = String(hay || '').toLowerCase();
        return list.find((term) => lower.includes(term.toLowerCase())) || '';
      };
      const pushResult = (item, source, keptKey) => {
        const dateStatus = officialDateStatus(item, source);
        if (!dateStatus.keep) return false;
        item.rawDate = item.pub || '';
        item.parsedDate = dateStatus.parseFailed ? '' : new Date(dateStatus.ms).toISOString();
        item.parseSuccess = !dateStatus.parseFailed;
        if (dateStatus.parseFailed) {
          item.dateParseFailed = true;
          item.pub = '';
        } else {
          item.pub = item.parsedDate;
        }
        results.push(item);
        if (keptKey && dropStats[keptKey] !== undefined) dropStats[keptKey] += 1;
        return true;
      };
      const companyWatchlist = [
        'TCS',
        'Tata Consultancy Services',
        'Infosys',
        'Wipro',
        'HCLTech',
        'HCL Technologies',
        'Tech Mahindra',
        'LTIMindtree',
        'Mphasis',
        'Persistent Systems',
        'Coforge',
        'L&T Technology Services',
        'Tata Elxsi',
        'Zomato',
        'Swiggy',
        'Paytm',
        'Nykaa',
        'Delhivery',
        'Reliance',
        'Adani',
        'Tata Motors',
        'Mahindra',
      ];
      const bseAnnouncementKeywords = [
        'financial results',
        'quarterly results',
        'unaudited financial results',
        'audited financial results',
        'outcome of board meeting',
        'board meeting outcome',
        'investor presentation',
        'annual report',
        'integrated annual report',
        'earnings presentation',
      ];
      const workplaceKeywords = [
        'headcount',
        'employees',
        'employee cost',
        'attrition',
        'hiring',
        'fresher',
        'campus hiring',
        'utilisation',
        'bench',
        'salary',
        'wage',
        'compensation',
        'layoffs',
        'workforce',
        'AI productivity',
        'automation',
        'return to office',
      ];
      const googleQueries = [
        '"Q1 results" OR "Q2 results" OR "Q3 results" OR "Q4 results" AND TCS OR Infosys OR Wipro OR HCLTech',
        '"annual report" OR "10-K" AND layoffs OR workforce OR headcount',
        '"Oracle" AND annual report AND layoffs',
        '"Accenture" AND headcount OR layoffs OR workforce',
        '"Cognizant" AND headcount OR hiring OR layoffs',
        '"Big Four" AND audit AND redundancies',
      ];
      const googleFallbackKeywords = [
        'annual report',
        '10-K',
        'headcount',
        'workforce',
        'layoffs',
        'job cuts',
        'attrition',
        'hiring',
        'employees',
      ];
      const secCompanies = [
        { name: 'Oracle', cik: '0001341439' },
        { name: 'Accenture', cik: '0001467373' },
        { name: 'Cognizant', cik: '0001058290' },
        { name: 'IBM', cik: '0000051143' },
        { name: 'Microsoft', cik: '0000789019' },
        { name: 'Amazon', cik: '0001018724' },
        { name: 'Google/Alphabet', cik: '0001652044' },
        { name: 'Meta', cik: '0001326801' },
        { name: 'Salesforce', cik: '0001108524' },
        { name: 'Workday', cik: '0001327811' },
        { name: 'ServiceNow', cik: '0001373715' },
        { name: 'Adobe', cik: '0000796343' },
      ];

      const pibUrls = [
        'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
        'https://pib.gov.in/allRel.aspx',
      ];
      for (const pibUrl of pibUrls) {
        const { text, row } = await fetchText('PIB Labour', pibUrl);
        if (!text) continue;
        const items = parseFeed(text, 'PIB Labour');
        row.count = items.length;
        rawItemsFetched += items.length;
        for (const item of items) {
          if (!item.pub) item.pub = await fetchPibDetailDate(item);
          pushResult({
            title: item.title,
            src: 'PIB Labour',
            cat: 'policy',
            pub: item.pub,
            link: item.link,
            sent: 'neutral',
            heat: 7,
            officialType: 'labour',
            matchedCompany: 'Ministry of Labour',
            matchedKeyword: 'PIB Labour',
            snippet: item.snippet,
          }, 'PIB Labour', 'keptPIB');
        }
        if (items.length) break;
      }

      // TODO: If BSE RSS blocks Cloudflare or changes format, add a dedicated BSE JSON/API Worker route later.
      const bseUrls = [
        'https://www.bseindia.com/data/xml/CorpAnn.xml',
        'https://www.bseindia.com/data/xml/notices.xml',
      ];
      for (const bseUrl of bseUrls) {
        const { text, row } = await fetchText('BSE Announcements', bseUrl);
        if (!text) continue;
        const items = parseFeed(text, 'BSE Announcements');
        row.count = items.length;
        rawItemsFetched += items.length;
        items.forEach((item) => {
          const hay = `${item.title} ${item.snippet}`;
          const company = firstMatch(hay, companyWatchlist);
          const announcementKeyword = firstMatch(hay, bseAnnouncementKeywords);
          if (!company) {
            dropStats.droppedNoCompanyMatch += 1;
            sampleDrop(item, 'BSE', 'no_company_match');
            return;
          }
          if (!announcementKeyword) {
            dropStats.droppedNoAnnouncementKeyword += 1;
            sampleDrop(item, 'BSE', 'no_announcement_keyword');
            return;
          }
          const workplaceKeyword = firstMatch(hay, workplaceKeywords);
          pushResult({
            title: item.title,
            src: 'BSE',
            cat: announcementKeyword.toLowerCase().includes('annual report') ? 'general' : 'investment',
            pub: item.pub,
            link: item.link,
            sent: 'neutral',
            heat: workplaceKeyword ? 8 : 6,
            officialType: announcementKeyword.toLowerCase().includes('annual report') ? 'annual_reports' : 'results',
            matchedCompany: company,
            matchedKeyword: workplaceKeyword || announcementKeyword,
            snippet: item.snippet,
          }, 'BSE', 'keptBSE');
        });
      }

      for (const query of googleQueries) {
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const { text, row } = await fetchText('Google News fallback', feedUrl);
        if (!text) continue;
        const items = parseFeed(text, 'Google News fallback');
        row.count = items.length;
        rawItemsFetched += items.length;
        items.slice(0, 8).forEach((item) => {
          const hay = `${item.title} ${item.snippet} ${query}`;
          const company = firstMatch(hay, companyWatchlist.concat(['Oracle', 'Accenture', 'Cognizant', 'Big Four']));
          const keyword = firstMatch(hay, googleFallbackKeywords.concat(bseAnnouncementKeywords).concat(workplaceKeywords).concat(['redundancies']));
          const queryMatched = true;
          if (!queryMatched && !keyword) {
            dropStats.droppedNoFallbackKeyword += 1;
            sampleDrop(item, 'Google News fallback', 'no_fallback_keyword');
            return;
          }
          pushResult({
            title: item.title,
            src: 'Official watch · Google News fallback',
            cat: 'general',
            pub: item.pub,
            link: item.link,
            sent: 'neutral',
            heat: 5,
            officialType: 'google_fallback',
            matchedCompany: company,
            matchedKeyword: keyword || 'fallback query',
            snippet: item.snippet,
          }, 'Google News fallback', 'keptGoogleFallback');
        });
      }

      for (const company of secCompanies) {
        const feedUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=&dateb=&owner=exclude&count=10&output=atom`;
        const { text, row } = await fetchText(`SEC ${company.name}`, feedUrl);
        if (!text) continue;
        const items = parseFeed(text, `SEC ${company.name}`);
        row.count = items.length;
        rawItemsFetched += items.length;
        items.forEach((item) => {
          const filingType = firstMatch(item.title, ['10-K', '10-Q', '8-K']);
          if (!filingType) {
            dropStats.droppedNoFilingType += 1;
            sampleDrop(item, `SEC ${company.name}`, 'no_filing_type');
            return;
          }
          pushResult({
            title: `${company.name}: ${item.title}`,
            src: 'SEC filing',
            cat: 'general',
            pub: item.pub,
            link: item.link,
            sent: 'neutral',
            heat: filingType === '8-K' ? 6 : 5,
            officialType: 'sec_filings',
            matchedCompany: company.name,
            matchedKeyword: filingType,
            officialNote: 'Filing alert only. Workplace signal may require reading the filing.',
            snippet: item.snippet,
          }, 'SEC filing', 'keptSEC');
        });
      }

      const seen = new Set();
      const deduped = results.filter((item) => {
        const key = `${item.title || ''}|${item.link || ''}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => {
        const aTime = a.dateParseFailed ? 0 : parseOfficialDate(a.pub);
        const bTime = b.dateParseFailed ? 0 : parseOfficialDate(b.pub);
        return (bTime || 0) - (aTime || 0) || (b.heat || 0) - (a.heat || 0);
      });

      return jsonResponse({
        ok: true,
        sourcesChecked: debug.length,
        rawItemsFetched,
        itemsAfterFilter: deduped.length,
        ...dropStats,
        results: deduped,
        debug,
        sampleDropped,
      });
    }

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
      const unauthorized = await requireProtectedRoute(request, env);
      if (unauthorized) return unauthorized;
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
              'Authorization': 'Bearer ' + (env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN),
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

    // /debug — checks Worker secrets without exposing values
    if (url.pathname === '/debug') {
      return jsonResponse({
        workerVersion: 'firebase-brief-v2',
        updatedAt: '2026-04-27',
        hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
        hasWebflowToken: Boolean(env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN),
        hasNewsDataKey: Boolean(env.NEWSDATA_API_KEY),
        newsDataKeyStartsWithPub: env.NEWSDATA_API_KEY
          ? env.NEWSDATA_API_KEY.trim().startsWith('pub_')
          : false,
      });
    }

    // /debug-brief — checks whether Worker can read Firebase editorial brief
    if (url.pathname === '/debug-brief') {
      try {
        const fbRes = await fetch(
          'https://firestore.googleapis.com/v1/projects/wocult-tasks/databases/(default)/documents/editorial_config/editorial_brief'
        );

        const fbData = await fbRes.json();
        const fields = fbData.fields || {};

        const readField = (name) => fields[name]?.stringValue || '';

        return jsonResponse({
          firebaseConnected: fbRes.ok,
          firebaseStatus: fbRes.status,
          documentFound: Boolean(fbData.name),
          documentPath: fbData.name || null,
          briefs: {
            generation: {
              exists: Boolean(readField('generation')),
              length: readField('generation').length,
            },
            refine: {
              exists: Boolean(readField('refine')),
              length: readField('refine').length,
            },
            scratch: {
              exists: Boolean(readField('scratch')),
              length: readField('scratch').length,
            },
          },
        });
      } catch (e) {
        return jsonResponse(
          {
            firebaseConnected: false,
            error: e.message,
          },
          500
        );
      }
    }

    // Default route — NewsData.io
    const rawQ = url.searchParams.get('q');
    const q = rawQ && rawQ.trim() ? rawQ.trim() : 'india workforce hiring layoffs';
    const scope = url.searchParams.get('scope');
    const domainurl = url.searchParams.get('domainurl');
    const removeduplicate = url.searchParams.get('removeduplicate');
    const prioritydomain = url.searchParams.get('prioritydomain');
    const excludecategory = url.searchParams.get('excludecategory');

    // Local query debug. Does not expose API key.
    if (url.searchParams.get('debug') === '1') {
      return jsonResponse({
        rawQ,
        finalQ: q,
        hasNewsDataKey: Boolean(env.NEWSDATA_API_KEY),
        keyStartsWithPub: env.NEWSDATA_API_KEY
          ? env.NEWSDATA_API_KEY.trim().startsWith('pub_')
          : false,
      });
    }

    const ndUrl = new URL('https://newsdata.io/api/1/latest');
    const newsDataKey = (env.NEWSDATA_API_KEY || '').trim();

    ndUrl.searchParams.set('apikey', newsDataKey);
    ndUrl.searchParams.set('q', q);
    if (scope !== 'global') {
      ndUrl.searchParams.set('country', 'in');
    }
    if (domainurl) {
      ndUrl.searchParams.set('domainurl', domainurl);
    }
    if (removeduplicate) {
      ndUrl.searchParams.set('removeduplicate', removeduplicate);
    }
    if (prioritydomain) {
      ndUrl.searchParams.set('prioritydomain', prioritydomain);
    }
    if (excludecategory) {
      ndUrl.searchParams.set('excludecategory', excludecategory);
    }
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
