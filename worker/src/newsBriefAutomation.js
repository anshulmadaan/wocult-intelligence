export const NEWS_TRACKER_API =
  'https://script.google.com/macros/s/AKfycbx0jptMFVvxkqzxzPLjh0buzWyeILTS_D8gcKWciLVmUhd2AdQ9CIWvfyGYbXcZH-Dx/exec?key=wocult-news-tracker-2026';

export const AUTOMATION_STATUSES = [
  'discovered',
  'evaluating',
  'rejected_by_filter',
  'needs_editorial_check',
  'verifying',
  'qualification_failed',
  'verification_failed',
  'drafting',
  'drafting_failed',
  'awaiting_approval',
  'held',
  'declined',
  'approved',
  'creating_webflow_draft',
  'webflow_draft_created',
  'webflow_failed',
];

const STAFF_EMAILS = new Set([
  'poorvi.arya23@gmail.com',
  'divya.madaan@gmail.com',
  'anmadaan@gmail.com',
]);

const REQUIRED_QUALIFICATION_FIELDS = {
  qualifies: 'boolean',
  overallScore: 'number',
  currentAffairsScore: 'number',
  wocultRelevanceScore: 'number',
  significanceScore: 'number',
  sourceQualityScore: 'number',
  newsBriefSuitabilityScore: 'number',
  indiaRelevance: ['high', 'medium', 'low', 'none'],
  duplicationRisk: ['high', 'medium', 'low'],
  factualRisk: ['high', 'medium', 'low'],
  legalRisk: ['high', 'medium', 'low'],
  verificationRequired: 'boolean',
  qualificationReasons: 'array',
  rejectionReasons: 'array',
  recommendedAngle: 'string',
  materialFacts: 'array',
  missingInformation: 'array',
};

const REQUIRED_DRAFT_FIELDS = [
  'title',
  'slug',
  'standfirst',
  'body',
  'seoDescription',
  'beat',
  'publishedDate',
  'sourceName',
  'sourceUrl',
];

export function getAutomationConfig(env = {}) {
  return {
    automationEnabled: flag(env.NEWS_BRIEF_AUTOMATION_ENABLED, false),
    emailEnabled: flag(env.NEWS_BRIEF_EMAIL_ENABLED, false),
    webflowEnabled: flag(env.NEWS_BRIEF_WEBFLOW_ENABLED, false),
    dryRun: flag(env.NEWS_BRIEF_DRY_RUN, true),
    minScore: numberEnv(env.NEWS_BRIEF_MIN_SCORE, 75),
    activeStartHourIst: numberEnv(env.NEWS_BRIEF_ACTIVE_START_HOUR_IST, 7),
    activeEndHourIst: numberEnv(env.NEWS_BRIEF_ACTIVE_END_HOUR_IST, 23),
    maxItemsPerRun: numberEnv(env.NEWS_BRIEF_MAX_ITEMS_PER_RUN, 10),
    maxConcurrentDrafts: numberEnv(env.NEWS_BRIEF_MAX_CONCURRENT_DRAFTS, 2),
    heldReminderEnabled: flag(env.NEWS_BRIEF_HELD_REMINDER_ENABLED, false),
    newsTrackerApi: env.NEWS_TRACKER_API || NEWS_TRACKER_API,
    emailFromName: env.EMAIL_FROM_NAME || 'Wocult Intelligence',
    emailFrom: env.EMAIL_FROM || 'intelligence@wocult.com',
    approverEmails: csv(env.EDITORIAL_APPROVER_EMAILS || 'wocultalert@gmail.com,divya@wocult.com'),
    replyTo: env.EMAIL_REPLY_TO || 'wocultalert@gmail.com',
    testEmailRecipient: env.TEST_EMAIL_RECIPIENT || 'wocultalert@gmail.com',
  };
}

export function normalizeNewsTrackerItem(item = {}, index = 0) {
  const sourceUrl = item.link || item.sourceUrl || item.url || '';
  const headline = clean(item.headline || item.title || '');
  const sourceId = clean(item.id || item.sourceItemId || item.rowId || item.guid || stableHash(`${headline}|${sourceUrl}|${item.dateFound || ''}`));
  return {
    sourceId,
    dateFound: clean(item.dateFound || item.foundDate || item.discoveredAt || ''),
    headline,
    source: clean(item.source || item.publisher || item.src || ''),
    sourceUrl: clean(sourceUrl),
    publicationDate: clean(item.publicationDate || item.publishedDate || item.pub || item.date || ''),
    theme: clean(item.theme || ''),
    priority: clean(item.priority || ''),
    suggestedFormat: clean(item.suggestedFormat || item.format || ''),
    whyItMatters: clean(item.whyItMatters || item.why || ''),
    verification: clean(item.verification || item.verificationInfo || ''),
    status: clean(item.status || ''),
    owner: clean(item.owner || ''),
    publishedLink: clean(item.publishedLink || item.wocultPublishedLink || ''),
    imageUrl: clean(item.imageUrl || item.image || ''),
    emailSubject: clean(item.emailSubject || ''),
    parsedFrom: clean(item.parsedFrom || ''),
    raw: item,
    rowIndex: index,
  };
}

export function normalizeNewsTrackerResponse(data = {}) {
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.results) ? data.results : [];
  return {
    ok: data.ok !== false,
    updatedAt: data.updatedAt || '',
    count: Number(data.count || items.length || 0),
    items: items.map(normalizeNewsTrackerItem),
  };
}

export function deterministicEligibility(item, now = new Date()) {
  const reasons = [];
  if (!item.headline) reasons.push('missing_headline');
  if (!isUsableUrl(item.sourceUrl)) reasons.push('missing_or_invalid_source_url');
  if (item.publishedLink) reasons.push('already_has_wocult_published_link');
  const status = `${item.status || ''}`.toLowerCase();
  if (/published|done|covered/i.test(status)) reasons.push('tracker_status_already_completed');

  const text = `${item.headline} ${item.theme} ${item.whyItMatters} ${item.suggestedFormat} ${item.verification}`.toLowerCase();
  const substantiveText = `${item.headline} ${item.theme} ${item.whyItMatters} ${item.verification}`.toLowerCase();
  if (/(opinion|motivation|productivity tips|career advice|listicle|celebrity|anonymous|social media only|viral post)/i.test(substantiveText)) {
    reasons.push('excluded_content_type');
  }
  if (!/(job|work|worker|employee|workplace|career|salary|pay|benefit|labour|labor|layoff|hiring|hire|office|remote|hybrid|ai|automation|skill|profession|company|court|policy|rights|burnout|health|restructur|headcount|workforce)/i.test(text)) {
    reasons.push('weak_working_professional_connection');
  }

  const dateMs = parseDateMs(item.publicationDate || item.dateFound);
  if (!dateMs) reasons.push('missing_date');
  else {
    const ageHours = Math.max(0, (now.getTime() - dateMs) / 3600000);
    if (ageHours > 72) reasons.push('older_than_72_hours');
    else if (ageHours > 36 && !/(p1|urgent|important|major|law|court|government|layoff|workforce|policy|regulation)/i.test(text)) {
      reasons.push('older_than_36_hours_without_importance_signal');
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export function createStoryFingerprint(item) {
  const urlKey = canonicalizeUrl(item.canonicalUrl || item.sourceUrl || '');
  const titleKey = normalizeText(item.headline || item.proposedHeadline || '');
  const org = extractLikelyOrganisation(item);
  const date = (item.publicationDate || item.dateFound || '').slice(0, 10);
  return stableHash([urlKey, titleKey.replace(/\b(to|will|may|says|amid|after|over)\b/g, ''), org, date].join('|'));
}

export function clusterKey(item) {
  const title = normalizeText(item.headline || item.proposedHeadline || '');
  const org = extractLikelyOrganisation(item);
  const event = (title.match(/\b(layoff|hiring|hire|restructur|salary|benefit|policy|court|regulation|ai|automation|workforce|return to office|remote|hybrid)\w*/i) || [''])[0];
  return stableHash(`${org}|${event}|${title.split(' ').slice(0, 8).join(' ')}`);
}

export function validateQualification(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['not_object'] };
  for (const [key, expected] of Object.entries(REQUIRED_QUALIFICATION_FIELDS)) {
    const actual = value[key];
    if (expected === 'array') {
      if (!Array.isArray(actual)) errors.push(`${key}_not_array`);
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual)) errors.push(`${key}_invalid`);
    } else if (typeof actual !== expected || (expected === 'number' && !Number.isFinite(actual))) {
      errors.push(`${key}_not_${expected}`);
    }
  }
  if (value.qualifies === true) {
    if (!['P1', 'P2', 'P3'].includes(value.recommendedPriority)) errors.push('recommendedPriority_invalid');
  } else if (value.qualifies === false && value.recommendedPriority !== null) {
    errors.push('recommendedPriority_invalid');
  }
  if (value.overallScore < 0 || value.overallScore > 100) errors.push('overallScore_out_of_range');
  return { ok: errors.length === 0, errors };
}

export function normalizeQualificationResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const normalized = {
    ...value,
    indiaRelevance: normalizeEnumValue(value.indiaRelevance, {
      high: 'high',
      medium: 'medium',
      low: 'low',
      none: 'none',
      no: 'none',
      nil: 'none',
    }),
    duplicationRisk: normalizeEnumValue(value.duplicationRisk, { high: 'high', medium: 'medium', low: 'low' }),
    factualRisk: normalizeEnumValue(value.factualRisk, { high: 'high', medium: 'medium', low: 'low' }),
    legalRisk: normalizeEnumValue(value.legalRisk, { high: 'high', medium: 'medium', low: 'low' }),
    recommendedPriority: normalizeRecommendedPriority(value.recommendedPriority, value.qualifies),
  };
  if (value.rawModelResponse) attachRawModelResponse(normalized, value.rawModelResponse);
  return normalized;
}

function normalizeRecommendedPriority(value, qualifies) {
  if (qualifies === false) {
    if (value === null || value === undefined) return null;
    return normalizeEnumValue(value, {
      p1: null,
      'priority 1': null,
      'priority one': null,
      high: null,
      urgent: null,
      p2: null,
      'priority 2': null,
      'priority two': null,
      medium: null,
      normal: null,
      p3: null,
      'priority 3': null,
      'priority three': null,
      low: null,
      p4: null,
      'priority 4': null,
      'priority four': null,
      reject: null,
      rejected: null,
      none: null,
      'n/a': null,
      na: null,
      'n a': null,
      'not applicable': null,
      '': null,
    }, null);
  }
  return normalizeEnumValue(value, {
    p1: 'P1',
    'priority 1': 'P1',
    'priority one': 'P1',
    high: 'P1',
    urgent: 'P1',
    p2: 'P2',
    'priority 2': 'P2',
    'priority two': 'P2',
    medium: 'P2',
    normal: 'P2',
    p3: 'P3',
    'priority 3': 'P3',
    'priority three': 'P3',
    low: 'P3',
  });
}

export function qualificationStatus(qualification, minScore = 75) {
  const score = Number(qualification?.overallScore || 0);
  if (!qualification?.qualifies || score < 60) return 'rejected_by_filter';
  if (score < minScore) return 'needs_editorial_check';
  return 'verifying';
}

export function validateDraft(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['not_object'] };
  REQUIRED_DRAFT_FIELDS.forEach((key) => {
    if (typeof value[key] !== 'string' || !value[key].trim()) errors.push(`${key}_missing`);
  });
  if (value.body && !/<p[\s>]/i.test(value.body)) errors.push('body_not_html_paragraphs');
  const words = stripHtml(value.body || '').split(/\s+/).filter(Boolean).length;
  if (words < 180 || words > 500) errors.push('body_word_count_outside_news_brief_range');
  return { ok: errors.length === 0, errors };
}

export function verifySources(candidate, fetchedSources = []) {
  const accessible = fetchedSources.filter((s) => s && s.ok !== false && s.url && (s.text || s.excerpt));
  const primary = accessible.find((s) => /primary|official|filing|government|court|regulator|company|research/i.test(s.type || s.publisher || s.url));
  const credibleSecondary = accessible.filter((s) => !primary || s.url !== primary.url);
  const conflicts = detectConflicts(accessible);
  if (conflicts.length) {
    return {
      status: 'conflicting_sources',
      ok: false,
      primarySourceUrl: primary?.url || '',
      supportingSourceUrls: credibleSecondary.map((s) => s.url),
      conflicts,
      summary: 'Sources contain conflicting material facts; editorial check required.',
    };
  }
  if (primary || credibleSecondary.length >= 2 || (credibleSecondary.length === 1 && lowRisk(candidate))) {
    return {
      status: 'verified',
      ok: true,
      primarySourceUrl: primary?.url || accessible[0]?.url || '',
      supportingSourceUrls: accessible.filter((s) => s.url !== (primary?.url || accessible[0]?.url)).map((s) => s.url),
      sourceTitles: accessible.map((s) => s.title || ''),
      publishers: accessible.map((s) => s.publisher || ''),
      excerpts: accessible.map((s) => (s.excerpt || s.text || '').slice(0, 500)),
      summary: primary ? 'Verified with a primary or official source.' : 'Verified with credible secondary source coverage.',
      confirmedFacts: extractConfirmedFacts(accessible),
      factsConfirmedAt: new Date().toISOString(),
    };
  }
  return {
    status: 'verification_failed',
    ok: false,
    primarySourceUrl: '',
    supportingSourceUrls: accessible.map((s) => s.url),
    summary: 'Not enough accessible factual source material.',
    sourceAccessFailures: fetchedSources.filter((s) => s && s.ok === false).map((s) => ({ url: s.url, error: s.error || 'fetch_failed' })),
  };
}

export async function signApprovalToken(payload, secret, cryptoImpl = globalThis.crypto) {
  if (!secret) throw new Error('APPROVAL_SIGNING_SECRET is required');
  const body = base64Url(JSON.stringify(payload));
  const sig = await hmacSha256(`${body}`, secret, cryptoImpl);
  return `${body}.${sig}`;
}

export async function verifyApprovalToken(token, secret, cryptoImpl = globalThis.crypto, now = Date.now()) {
  const [body, sig, extra] = String(token || '').split('.');
  if (!body || !sig || extra) return { ok: false, reason: 'malformed_token' };
  const expected = await hmacSha256(body, secret, cryptoImpl);
  if (!constantTimeEqual(sig, expected)) return { ok: false, reason: 'invalid_signature' };
  let payload;
  try {
    payload = JSON.parse(textFromBase64Url(body));
  } catch (e) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (!payload.exp || Number(payload.exp) < now) return { ok: false, reason: 'expired_token', payload };
  if (!payload.candidateId || !payload.action || !payload.recipient || !payload.nonce || !payload.cycleId) {
    return { ok: false, reason: 'missing_claims', payload };
  }
  if (!['approve', 'hold', 'decline'].includes(payload.action)) return { ok: false, reason: 'invalid_action', payload };
  return { ok: true, payload };
}

export function renderApprovalEmail(candidates, recipient, linksByCandidate = {}, config = {}) {
  const safeRecipient = escapeHtml(recipient);
  const rows = candidates.map((c) => {
    const links = linksByCandidate[c.id] || {};
    if (!c.sourcePublishedAt) {
      c = {
        ...c,
        sourcePublishedAt: `Source publication time unknown; discovered ${c.discoveredAt || c.discoveredTimestamp || ''}`.trim(),
        discoveredAt: '',
      };
    }
    return `
      <section style="border:1px solid #e6e1d5;border-radius:8px;padding:16px;margin:16px 0;background:#fff">
        <h2 style="font-family:Georgia,serif;font-size:20px;line-height:1.3;margin:0 0 8px;color:#151515">${escapeHtml(c.proposedHeadline || c.originalHeadline || '')}</h2>
        <p style="margin:0 0 8px;color:#555;font-size:13px">Original: ${escapeHtml(c.originalHeadline || '')}</p>
        <p style="margin:0 0 8px;color:#555;font-size:13px">${escapeHtml(c.publisher || '')} · ${escapeHtml(c.sourcePublishedAt || c.discoveredAt || '')} · Score ${escapeHtml(String(c.qualificationScore || ''))} · ${escapeHtml(c.recommendedPriority || '')}</p>
        <p style="font-size:14px;line-height:1.55"><strong>Why it qualifies:</strong> ${escapeHtml((c.qualificationResult?.qualificationReasons || []).join(' '))}</p>
        <p style="font-size:14px;line-height:1.55"><strong>Wocult angle:</strong> ${escapeHtml(c.recommendedAngle || c.qualificationResult?.recommendedAngle || '')}</p>
        <p style="font-size:14px;line-height:1.55"><strong>Verification:</strong> ${escapeHtml(c.verificationSummary || '')}</p>
        <p><a href="${escapeAttr(c.primarySourceUrl || c.canonicalUrl || '')}">Primary source</a>${(c.supportingSourceUrls || []).map((u) => ` · <a href="${escapeAttr(u)}">Supporting source</a>`).join('')}</p>
        <div style="font-size:14px;line-height:1.65;border-top:1px solid #eee;padding-top:12px">${c.generatedDraft?.body || escapeHtml(c.generatedDraftPreview || '')}</div>
        <p style="margin-top:14px"><a href="${escapeAttr(links.review || '#')}">Open full draft in dashboard</a></p>
        <p>
          <a href="${escapeAttr(links.approve || '#')}" style="display:inline-block;background:#151515;color:#ffd84d;text-decoration:none;padding:10px 14px;border-radius:7px;margin-right:8px">Approve</a>
          <a href="${escapeAttr(links.hold || '#')}" style="display:inline-block;background:#f3f1ea;color:#151515;text-decoration:none;padding:10px 14px;border-radius:7px;margin-right:8px">Hold</a>
          <a href="${escapeAttr(links.decline || '#')}" style="display:inline-block;background:#fff;color:#b42318;border:1px solid #b42318;text-decoration:none;padding:10px 14px;border-radius:7px">Decline</a>
        </p>
      </section>`;
  }).join('');
  return {
    subject: `${config.test ? '[TEST] ' : ''}Wocult News Brief approvals`,
    html: `<main style="font-family:Arial,sans-serif;background:#f8f6ef;padding:20px;color:#151515"><div style="max-width:720px;margin:0 auto"><h1 style="font-family:Georgia,serif">Wocult News Brief approvals</h1><p style="color:#555">Sent to ${safeRecipient}. Links are signed for this recipient only.</p>${rows}</div></main>`,
  };
}

export function createDecisionConfirmationHtml(candidate, action, recipient, currentStatus, token) {
  const title = escapeHtml(candidate?.proposedHeadline || candidate?.originalHeadline || 'News Brief candidate');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm ${escapeHtml(action)}</title><style>body{font-family:Arial,sans-serif;background:#f8f6ef;color:#151515;margin:0;padding:24px}.box{max-width:680px;margin:0 auto;background:#fff;border:1px solid #e6e1d5;border-radius:8px;padding:22px}button{border:0;border-radius:7px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:#151515;color:#ffd84d}.cancel{background:#eee;color:#151515}</style></head><body><div class="box"><h1>${title}</h1><p>Selected action: <strong>${escapeHtml(action)}</strong></p><p>Current status: ${escapeHtml(currentStatus || '')}</p><p>Recipient: ${escapeHtml(recipient || '')}</p><form method="post" action="/automation/news-briefs/action"><input type="hidden" name="token" value="${escapeAttr(token)}"><button class="primary" type="submit">Confirm action</button> <button class="cancel" type="button" onclick="history.back()">Cancel</button></form></div></body></html>`;
}

export async function fetchNewsTracker(config, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const url = `${config.newsTrackerApi}${config.newsTrackerApi.includes('?') ? '&' : '?'}t=${Date.now()}`;
  const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 15000, fetchImpl);
  if (!res.ok) throw new Error(`News Tracker returned ${res.status}`);
  return normalizeNewsTrackerResponse(await res.json());
}

export async function callClaudeJson(env, prompt, maxTokens = 1200, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: env.NEWS_BRIEF_CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 45000, fetchImpl);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `Anthropic returned ${res.status}`);
  const txt = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try {
    return parseJsonFromText(txt);
  } catch (e) {
    e.modelDiagnostic = safeModelDiagnostic(txt);
    throw e;
  }
}

export function buildQualificationPrompt(item) {
  return `You are a Wocult senior editor deciding whether a News Tracker item qualifies as a concise current-affairs News Brief for Indian working professionals.

Return ONLY valid JSON with this exact structure:
{"qualifies":true,"overallScore":0,"currentAffairsScore":0,"wocultRelevanceScore":0,"significanceScore":0,"sourceQualityScore":0,"newsBriefSuitabilityScore":0,"indiaRelevance":"high","duplicationRisk":"low","factualRisk":"low","legalRisk":"low","verificationRequired":true,"qualificationReasons":[],"rejectionReasons":[],"recommendedPriority":"P2","recommendedAngle":"","materialFacts":[],"missingInformation":[]}

If qualifies is true, recommendedPriority must be exactly P1, P2, or P3.
If qualifies is false, recommendedPriority must be null. Do not return P4.

Assess the item independently. suggestedFormat is only a signal, not a decision.

News Tracker item:
${JSON.stringify(item, null, 2)}`;
}

export function buildDraftPrompt(candidate) {
  return `Write a reported Wocult news brief after verification. Return ONLY valid JSON with title, slug, shortIntro, intro40, excerpt, standfirst, body, readTime, writerName, publishedDate, beat, sourceName, sourceUrl, imageUrl, seoDescription, wocultAngle, verificationNote.

Rules: 250-400 words, British English, fact-led, for working professionals, no invented quotes or unsupported numbers, valid HTML paragraphs in body only.

Candidate and verified sources:
${JSON.stringify(candidate, null, 2)}`;
}

export function candidateFromTrackerItem(item, qualification = null, verification = null, draft = null) {
  const fingerprint = createStoryFingerprint(item);
  const storedQualification = sanitizeQualificationForStorage(qualification);
  return {
    candidateId: `nt_${fingerprint}`,
    newsTrackerSourceId: item.sourceId,
    storyFingerprint: fingerprint,
    originalHeadline: item.headline,
    proposedHeadline: draft?.title || '',
    canonicalUrl: canonicalizeUrl(item.sourceUrl),
    primarySourceUrl: verification?.primarySourceUrl || item.sourceUrl,
    supportingSourceUrls: verification?.supportingSourceUrls || [],
    sourceTitles: verification?.sourceTitles || [item.headline],
    publishers: verification?.publishers || [item.source],
    sourceType: 'news_tracker',
    sourcePublishedTimestamp: item.publicationDate || '',
    discoveredTimestamp: item.dateFound || new Date().toISOString(),
    theme: item.theme,
    originalPriority: item.priority,
    originalSuggestedFormat: item.suggestedFormat,
    originalWhyItMatters: item.whyItMatters,
    qualificationResult: storedQualification,
    qualificationScore: storedQualification?.overallScore || 0,
    recommendedPriority: storedQualification ? storedQualification.recommendedPriority : '',
    recommendedAngle: storedQualification?.recommendedAngle || '',
    verificationStatus: verification?.status || '',
    verificationSummary: verification?.summary || '',
    verifiedFacts: verification?.confirmedFacts || [],
    generatedDraft: draft,
    generatedTimestamp: draft ? new Date().toISOString() : '',
    decisionStatus: '',
    emailStatus: '',
    webflowStatus: '',
    retryCount: 0,
    version: 1,
    trackerItem: item,
    clusterKey: clusterKey(item),
  };
}

export function candidateCreatedAtFallback(existing = {}, now = new Date().toISOString()) {
  return existing.createdAt
    || existing.discoveredAt
    || existing.discoveredTimestamp
    || existing.sourceDiscoveredTimestamp
    || existing.trackerItem?.dateFound
    || existing.updatedAt
    || now;
}

export function withCandidateMetadata(candidate, existing = null, options = {}) {
  const now = options.now || new Date().toISOString();
  const candidateId = candidate.candidateId || candidate.id;
  const existingDoc = existing || null;
  const processingRunId = options.runId
    || candidate.lastProcessedRunId
    || candidate.runId
    || existingDoc?.lastProcessedRunId
    || existingDoc?.runId
    || '';
  const firstSeenRunId = existingDoc?.firstSeenRunId
    || candidate.firstSeenRunId
    || processingRunId
    || '';
  const createdAt = existingDoc
    ? candidateCreatedAtFallback(existingDoc, now)
    : candidate.createdAt || now;
  const updated = {
    ...candidate,
    candidateId,
    createdAt,
    updatedAt: now,
    firstSeenRunId,
    lastProcessedRunId: processingRunId,
    runId: processingRunId,
  };
  if (existingDoc && !existingDoc.createdAt) updated.metadataBackfilled = true;
  if (existingDoc && !existingDoc.firstSeenRunId && processingRunId) updated.metadataBackfilled = true;
  return updated;
}

export async function requireWorkerAdmin(request, env, deps = {}) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (env.WORKER_ADMIN_TOKEN && bearer && constantTimeEqual(bearer, env.WORKER_ADMIN_TOKEN)) return { ok: true, type: 'admin_token' };
  if (bearer && env.FIREBASE_PROJECT_ID) {
    const claims = await verifyFirebaseIdToken(bearer, env, deps).catch(() => null);
    if (claims && STAFF_EMAILS.has(String(claims.email || '').toLowerCase())) return { ok: true, type: 'firebase_staff', claims };
  }
  return { ok: false };
}

export async function requireProtectedRoute(request, env, deps = {}) {
  const auth = await requireWorkerAdmin(request, env, deps);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...(deps.cors || {}), 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export async function requireFirebaseAdminEmailRoute(request, env, deps = {}) {
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  let claims = null;
  if (bearer && env.FIREBASE_PROJECT_ID) {
    claims = await verifyFirebaseIdToken(bearer, env, deps).catch(() => null);
  }
  const email = String(claims?.email || '').toLowerCase();
  if (email === 'anmadaan@gmail.com') return { ok: true, claims };
  return new Response(JSON.stringify({ ok: false, error: claims ? 'Forbidden' : 'Unauthorized' }), {
    status: claims ? 403 : 401,
    headers: { ...(deps.cors || {}), 'Content-Type': 'application/json' },
  });
}

export async function handleAutomationRequest(request, env, ctx, shared = {}, deps = {}) {
  const url = new URL(request.url);
  const isNewsBriefAutomationRoute =
    url.pathname === '/automation/news-briefs'
    || url.pathname.startsWith('/automation/news-briefs/');

  if (!isNewsBriefAutomationRoute) return null;

  const json = shared.jsonResponse || ((data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
  if (request.method === 'OPTIONS') return new Response(null, { headers: shared.cors || {} });

  if (url.pathname === '/automation/news-briefs/review' && request.method === 'GET') {
    const token = url.searchParams.get('token');
    const verified = await verifyApprovalToken(token, env.APPROVAL_SIGNING_SECRET, deps.crypto || globalThis.crypto);
    await recordAttempt(env, verified.payload?.candidateId || 'unknown', 'approval-page opening', { ok: verified.ok, reason: verified.reason, recipient: verified.payload?.recipient }, deps);
    if (!verified.ok) return new Response(createMessageHtml('Invalid or expired link', verified.reason), { status: 400, headers: { 'Content-Type': 'text/html' } });
    const store = getStore(env, deps);
    const candidate = await store.getCandidate(verified.payload.candidateId);
    if (!candidate) return new Response(createMessageHtml('Candidate not found', ''), { status: 404, headers: { 'Content-Type': 'text/html' } });
    return new Response(createDecisionConfirmationHtml(candidate, verified.payload.action, verified.payload.recipient, candidate.status, token), { headers: { 'Content-Type': 'text/html' } });
  }

  if (url.pathname === '/automation/news-briefs/action' && request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';
    const body = contentType.includes('application/json') ? await request.json() : Object.fromEntries((await request.formData()).entries());
    let result;
    if (body.token) {
      result = await confirmDecision(body.token, body.note || body.reason || '', env, deps);
    } else {
      const protectedResponse = await requireProtectedRoute(request, env, { ...deps, cors: shared.cors });
      if (protectedResponse) return protectedResponse;
      result = await dashboardDecision(body.candidateId, body.action, body.actorEmail || '', body.note || body.reason || '', env, deps);
    }
    if (contentType.includes('application/json')) return json(result, result.ok ? 200 : 409);
    const message = result.ok && result.candidate?.webflowStatus === 'webflow_draft_created'
      ? 'Approved. The News Brief has been created in Webflow as a draft.'
      : result.ok && result.status === 'approved'
        ? 'Approved. Webflow draft creation is disabled or needs retry.'
        : result.message || result.error || 'Decision recorded.';
    return new Response(createMessageHtml(message, result.detail || ''), { status: result.ok ? 200 : 409, headers: { 'Content-Type': 'text/html' } });
  }

  const protectedResponse = await requireProtectedRoute(request, env, { ...deps, cors: shared.cors });
  if (protectedResponse) return protectedResponse;

  if (url.pathname === '/automation/news-briefs/run' && request.method === 'POST') {
    const body = await safeJson(request);
    return json(await runNewsBriefAutomation(env, { triggerType: body.triggerType || 'manual', dryRun: body.dryRun }, deps));
  }
  if (url.pathname === '/automation/news-briefs/status' && request.method === 'GET') {
    return json(await getAutomationStatus(env, deps));
  }
  if (url.pathname === '/automation/news-briefs/retry' && request.method === 'POST') {
    const body = await safeJson(request);
    return json(await retryCandidate(body.candidateId, env, deps));
  }
  if (url.pathname === '/automation/news-briefs/test-email' && request.method === 'POST') {
    return json(await sendTestEmail(env, deps));
  }
  return json({ ok: false, error: 'automation_route_not_found' }, 404);
}

export async function scheduledNewsBriefAutomation(env, ctx, deps = {}) {
  const config = getAutomationConfig(env);
  if (!isActiveHourIst(new Date(), config)) return { ok: true, skipped: true, reason: 'outside_active_hours_ist' };
  if (!config.automationEnabled) return { ok: true, skipped: true, reason: 'automation_disabled' };
  return runNewsBriefAutomation(env, { triggerType: 'scheduled' }, deps);
}

export async function runNewsBriefAutomation(env, options = {}, deps = {}) {
  const config = getAutomationConfig(env);
  const dryRun = options.dryRun !== undefined ? !!options.dryRun : config.dryRun;
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const summary = {
    runId,
    triggerType: options.triggerType || 'manual',
    startTime: new Date(startedAt).toISOString(),
    itemsReceived: 0,
    itemsSkipped: 0,
    itemsRejected: 0,
    itemsNeedingEditorialCheck: 0,
    itemsVerified: 0,
    draftsGenerated: 0,
    emailsSent: 0,
    failures: 0,
    dryRun,
    errorSummary: [],
  };
  const store = getStore(env, deps);
  try {
    if (!config.automationEnabled && !dryRun) throw new Error('NEWS_BRIEF_AUTOMATION_ENABLED is not enabled');
    const tracker = await fetchNewsTracker(config, deps);
    summary.itemsReceived = tracker.items.length;
    const awaiting = [];
    const seenClusters = new Set();
    let attemptedItems = 0;

    for (const item of tracker.items) {
      let processingStage = 'qualification';
      try {
        const fingerprint = createStoryFingerprint(item);
        const cKey = clusterKey(item);
        if (seenClusters.has(cKey) || await store.existsByFingerprint(fingerprint) || await store.isDeclinedSuppressed(cKey)) {
          summary.itemsSkipped += 1;
          continue;
        }
        seenClusters.add(cKey);
        if (attemptedItems >= config.maxItemsPerRun) break;
        attemptedItems += 1;
        const deterministic = deterministicEligibility(item);
        if (!deterministic.eligible) {
          summary.itemsRejected += 1;
          await store.saveCandidate(withCandidateMetadata({
            ...candidateFromTrackerItem(item),
            candidateId: `nt_${fingerprint}`,
            status: 'rejected_by_filter',
            rejectionReasons: deterministic.reasons,
            dryRun,
          }, null, { runId }), { dryRun, runId });
          continue;
        }
        processingStage = 'qualification';
        const qualification = normalizeQualificationResponse(await callClaudeJson(env, buildQualificationPrompt(item), 1400, deps));
        const qValid = validateQualification(qualification);
        if (!qValid.ok) {
          const err = new Error(`Invalid qualification JSON: ${qValid.errors.join(',')}`);
          err.qualificationDiagnostic = safeModelDiagnostic(qualification?.rawModelResponse || JSON.stringify(qualification || {}));
          err.failureStatus = 'qualification_failed';
          throw err;
        }
        const nextStatus = qualificationStatus(qualification, config.minScore);
        if (nextStatus === 'rejected_by_filter') summary.itemsRejected += 1;
        if (nextStatus === 'needs_editorial_check') summary.itemsNeedingEditorialCheck += 1;
        let verification = null;
        let draft = null;
        let status = nextStatus;
        if (nextStatus === 'verifying') {
          processingStage = 'verification';
          verification = await verifyCandidateSources(item, deps);
          if (!verification.ok) status = 'verification_failed';
          else {
            summary.itemsVerified += 1;
            processingStage = 'drafting';
            status = 'drafting';
            draft = await callClaudeJson(env, buildDraftPrompt({ item, qualification, verification }), 1800, deps);
            const dValid = validateDraft(draft);
            if (!dValid.ok) {
              const err = new Error(`Invalid draft JSON: ${dValid.errors.join(',')}`);
              err.failureStatus = 'drafting_failed';
              throw err;
            }
            status = 'awaiting_approval';
            summary.draftsGenerated += 1;
          }
        }
        const candidate = withCandidateMetadata({ ...candidateFromTrackerItem(item, qualification, verification, draft), status, dryRun }, null, { runId });
        await store.saveCandidate(candidate, { dryRun, runId });
        await store.addActivity(candidate.candidateId, 'qualification', { status, score: qualification.overallScore }, { dryRun });
        if (status === 'awaiting_approval') awaiting.push(candidate);
      } catch (e) {
        summary.failures += 1;
        summary.errorSummary.push(stripEmptyOptionalFields({
          headline: item.headline,
          error: e.message,
          qualificationDiagnostic: e.qualificationDiagnostic || e.modelDiagnostic,
        }));
        const failedStatus = e.failureStatus || `${processingStage}_failed`;
        const failedCandidate = withCandidateMetadata({
          ...candidateFromTrackerItem(item),
          status: failedStatus,
          dryRun,
          lastError: e.message,
          qualificationDiagnostic: e.qualificationDiagnostic || e.modelDiagnostic || '',
        }, null, { runId });
        await store.saveCandidate(failedCandidate, { dryRun, runId }).catch(() => {});
      }
    }

    if (!dryRun && config.emailEnabled && awaiting.length) {
      summary.emailsSent = await sendApprovalDigest(awaiting, env, deps);
    }
  } catch (e) {
    summary.failures += 1;
    summary.errorSummary.push({ run: e.message });
  } finally {
    summary.endTime = new Date().toISOString();
    summary.duration = Date.now() - startedAt;
    await store.saveRun(summary, { dryRun }).catch(() => {});
  }
  return { ok: summary.failures === 0, summary };
}

async function verifyCandidateSources(item, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const sources = [];
  if (item.sourceUrl) {
    try {
      const res = await fetchWithTimeout(item.sourceUrl, { headers: { 'User-Agent': 'WocultIntelligence/1.0 by Wocult' } }, 12000, fetchImpl);
      const text = await res.text();
      sources.push({ ok: res.ok, url: item.sourceUrl, title: item.headline, publisher: item.source, text: text.slice(0, 4000), excerpt: stripHtml(text).slice(0, 700), type: /gov|court|sebi|rbi|bseindia|nseindia|company|investor|annual|filing/i.test(item.sourceUrl) ? 'primary' : 'secondary' });
    } catch (e) {
      sources.push({ ok: false, url: item.sourceUrl, error: e.message });
    }
  }
  return verifySources(item, sources);
}

async function sendApprovalDigest(candidates, env, deps = {}) {
  const config = getAutomationConfig(env);
  let count = 0;
  for (const recipient of config.approverEmails) {
    const links = {};
    for (const c of candidates) {
      const cycleId = c.decisionCycleId || `cycle_${Date.now()}`;
      links[c.candidateId] = {};
      for (const action of ['approve', 'hold', 'decline']) {
        const token = await signApprovalToken({
          candidateId: c.candidateId,
          action,
          recipient,
          iat: Date.now(),
          exp: Date.now() + 7 * 24 * 3600000,
          nonce: cryptoRandom(),
          cycleId,
          version: c.version || 1,
        }, env.APPROVAL_SIGNING_SECRET, deps.crypto || globalThis.crypto);
        links[c.candidateId][action] = `${env.PUBLIC_WORKER_URL || 'https://wocult-news-proxy.anmadaan.workers.dev'}/automation/news-briefs/review?token=${encodeURIComponent(token)}`;
      }
      links[c.candidateId].review = links[c.candidateId].approve;
    }
    const email = renderApprovalEmail(candidates.map((c) => ({ ...c, id: c.candidateId, publisher: c.publishers?.[0] || c.trackerItem?.source })), recipient, links, config);
    await sendEmail(env, { to: recipient, subject: email.subject, html: email.html, replyTo: config.replyTo }, deps);
    count += 1;
  }
  return count;
}

async function confirmDecision(token, note, env, deps = {}) {
  const verified = await verifyApprovalToken(token, env.APPROVAL_SIGNING_SECRET, deps.crypto || globalThis.crypto);
  const store = getStore(env, deps);
  if (!verified.ok) {
    await recordAttempt(env, verified.payload?.candidateId || 'unknown', 'failed or reused token', { ok: false, reason: verified.reason }, deps);
    return { ok: false, error: verified.reason };
  }
  const p = verified.payload;
  return store.transactionDecision(p, async (candidate) => {
    if (!candidate) return { ok: false, error: 'candidate_not_found' };
    if (candidate.decisionCycleId && candidate.decisionCycleId !== p.cycleId) return { ok: false, error: 'superseded_decision_cycle' };
    if (candidate.version && Number(candidate.version) !== Number(p.version || 1)) return { ok: false, error: 'superseded_draft_version' };
    if (!['awaiting_approval', 'held'].includes(candidate.status)) {
      return { ok: false, error: 'already_decided', message: `This item has already been decided as ${candidate.status}.`, detail: candidate.decisionBy || '' };
    }
    const nextStatus = p.action === 'approve' ? 'approved' : p.action === 'hold' ? 'held' : 'declined';
    const patch = {
      status: nextStatus,
      decisionStatus: nextStatus,
      decisionTimestamp: new Date().toISOString(),
      decisionBy: p.recipient,
      decisionCycleId: p.cycleId,
      usedApprovalNonces: [...new Set([...(candidate.usedApprovalNonces || []), p.nonce])],
      decisionReason: note || '',
      updatedAt: new Date().toISOString(),
    };
    let after = { ...candidate, ...patch };
    if (p.action === 'approve') {
      after = await createArticleAndWebflowDraft(after, env, deps);
    }
    after = withCandidateMetadata(after, candidate, { runId: `decision_${Date.now()}` });
    await store.addActivity(p.candidateId, 'confirmed decision', { action: p.action, recipient: p.recipient }, {});
    return { ok: true, status: after.status, candidate: after };
  });
}

async function dashboardDecision(candidateId, action, actorEmail, note, env, deps = {}) {
  if (!candidateId || !['approve', 'hold', 'decline'].includes(action)) return { ok: false, error: 'invalid_dashboard_action' };
  const store = getStore(env, deps);
  return store.transactionDecision({
    candidateId,
    action,
    recipient: actorEmail || 'staff_dashboard',
    nonce: `dashboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    cycleId: `dashboard_${Date.now()}`,
    version: 0,
  }, async (candidate) => {
    if (!candidate) return { ok: false, error: 'candidate_not_found' };
    if (!['awaiting_approval', 'held', 'approved'].includes(candidate.status)) {
      return { ok: false, error: 'action_not_available_for_status' };
    }
    if (candidate.status === 'approved' && action === 'approve') {
      const existing = await createArticleAndWebflowDraft(candidate, env, deps);
      return { ok: true, status: existing.status, candidate: existing };
    }
    const nextStatus = action === 'approve' ? 'approved' : action === 'hold' ? 'held' : 'declined';
    let updated = {
      ...candidate,
      status: nextStatus,
      decisionStatus: nextStatus,
      decisionTimestamp: new Date().toISOString(),
      decisionBy: actorEmail || 'staff_dashboard',
      decisionReason: note || '',
      decisionCycleId: '',
      updatedAt: new Date().toISOString(),
    };
    if (action === 'approve') updated = await createArticleAndWebflowDraft(updated, env, deps);
    updated = withCandidateMetadata(updated, candidate, { runId: `decision_${Date.now()}` });
    await store.addActivity(candidateId, 'manual dashboard edits', { action, actorEmail }, {});
    return { ok: true, status: updated.status, candidate: updated };
  });
}

async function createArticleAndWebflowDraft(candidate, env, deps = {}) {
  const config = getAutomationConfig(env);
  const store = getStore(env, deps);
  let updated = { ...candidate };
  if (config.dryRun) {
    updated.webflowStatus = 'dry_run_skipped';
    updated.articleStatus = 'dry_run_skipped';
    return updated;
  }
  if (!updated.firebaseArticleId) {
    const article = automationCandidateToArticle(updated);
    const articleId = await store.createArticle(article, `automation_${updated.candidateId}`);
    updated.firebaseArticleId = articleId;
  }
  if (!config.webflowEnabled) {
    updated.webflowStatus = 'disabled';
    return updated;
  }
  if (!updated.webflowItemId) {
    try {
      updated.status = 'creating_webflow_draft';
      const wf = await createWebflowNewsDraft(updated.generatedDraft, env, deps);
      updated.webflowItemId = wf.id || wf._id || '';
      updated.webflowDraftUrl = wf.cmsLocaleId || wf.slug || '';
      updated.webflowStatus = 'webflow_draft_created';
      updated.status = 'webflow_draft_created';
      updated.webflowCompletedAt = new Date().toISOString();
    } catch (e) {
      updated.status = 'approved';
      updated.webflowStatus = 'webflow_failed';
      updated.lastError = e.message;
    }
  }
  return updated;
}

export function automationCandidateToArticle(candidate) {
  const d = candidate.generatedDraft || {};
  return {
    title: d.title || candidate.proposedHeadline || candidate.originalHeadline,
    slug: d.slug,
    standfirst: d.standfirst || d.shortIntro || '',
    shortIntro: d.shortIntro || d.standfirst || '',
    intro40: d.intro40 || d.standfirst || '',
    excerpt: d.excerpt || d.seoDescription || '',
    body: d.body || '',
    seoDescription: d.seoDescription || '',
    beat: d.beat || 'Future of Work',
    publishedDate: d.publishedDate || new Date().toISOString(),
    publishDate: d.publishedDate || new Date().toISOString(),
    readTime: d.readTime || '2 min read',
    writerName: d.writerName || 'Wocult Team',
    sourceUrl: d.sourceUrl || candidate.primarySourceUrl || candidate.canonicalUrl,
    sourceName: d.sourceName || candidate.publishers?.[0] || '',
    imageUrl: d.imageUrl || '',
    status: 'submitted',
    sourceType: 'automated_news_brief',
    automationCandidateId: candidate.candidateId,
    storyFingerprint: candidate.storyFingerprint,
  };
}

export function buildAutomationNewsFieldData(draft = {}) {
  const title = toSentenceCaseHeadline(draft.title || draft.name || '');
  return stripEmptyOptionalFields({
    name: title,
    slug: draft.slug,
    standfirst: draft.standfirst || draft.shortIntro || draft.excerpt || '',
    body: draft.body || '',
    beat: draft.beat || draft.category || 'Future of Work',
    'published-date': draft.publishedDate || draft.publishDate || new Date().toISOString(),
    'source-name': draft.sourceName || draft['source-name'] || '',
    'source-url': draft.sourceUrl || draft['source-url'] || '',
    'seo-description': draft.seoDescription || draft['seo-description'] || draft.standfirst || '',
    'news-image': draft.imageUrl || draft.newsImage || draft['news-image'] || '',
  });
}

export async function createWebflowNewsDraft(draft, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const collectionId = env.WEBFLOW_NEWS_COLLECTION_ID || '6a4d6ad32871d46ed1edc6a4';
  const res = await fetchWithTimeout(`https://api.webflow.com/v2/collections/${collectionId}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN || ''}`,
      accept: 'application/json',
    },
    body: JSON.stringify({ fieldData: buildAutomationNewsFieldData(draft), isDraft: true, isArchived: false }),
  }, 20000, fetchImpl);
  const text = await res.text();
  const data = text ? parseJsonFromText(text, true) : {};
  if (!res.ok) throw new Error(`Webflow draft failed: ${res.status}`);
  return data;
}

async function getAutomationStatus(env, deps = {}) {
  const store = getStore(env, deps);
  return {
    ok: true,
    config: redactConfig(getAutomationConfig(env)),
    counts: await store.statusCounts(),
    latestRuns: await store.latestRuns(10),
  };
}

async function retryCandidate(candidateId, env, deps = {}) {
  const store = getStore(env, deps);
  const candidate = await store.getCandidate(candidateId);
  if (!candidate) return { ok: false, error: 'candidate_not_found' };
  if (candidate.webflowStatus === 'webflow_failed' || candidate.status === 'approved') {
    const retryRunId = `retry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const updated = withCandidateMetadata(await createArticleAndWebflowDraft(candidate, env, deps), candidate, { runId: retryRunId });
    await store.saveCandidate(updated, { existingCandidate: candidate, runId: retryRunId });
    return { ok: true, candidate: updated };
  }
  return { ok: false, error: 'retry_not_available_for_status' };
}

async function sendTestEmail(env, deps = {}) {
  const config = getAutomationConfig(env);
  const candidate = {
    id: 'test',
    proposedHeadline: 'Test automated News Brief approval',
    originalHeadline: 'Test only',
    publisher: 'Wocult',
    qualificationScore: 100,
    recommendedPriority: 'P3',
    recommendedAngle: 'Test email only. Action links are non-operational.',
    verificationSummary: 'Test verification summary.',
    generatedDraft: { body: '<p>This is a test email for Wocult News Brief automation. It cannot create a Webflow item.</p>' },
    primarySourceUrl: 'https://wocult.com',
    supportingSourceUrls: [],
    qualificationResult: { qualificationReasons: ['Test mode'] },
  };
  const email = renderApprovalEmail([candidate], config.testEmailRecipient, { test: { approve: '#', hold: '#', decline: '#', review: '#' } }, { test: true });
  if (!config.emailEnabled) return { ok: true, skipped: true, reason: 'NEWS_BRIEF_EMAIL_ENABLED is disabled', previewSubject: email.subject };
  await sendEmail(env, { to: config.testEmailRecipient, subject: email.subject, html: email.html, replyTo: config.replyTo }, deps);
  return { ok: true, sentTo: config.testEmailRecipient };
}

async function sendEmail(env, message, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');
  const config = getAutomationConfig(env);
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${config.emailFromName} <${config.emailFrom}>`,
      to: [message.to],
      reply_to: message.replyTo,
      subject: message.subject,
      html: message.html,
    }),
  }, 15000, fetchImpl);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Resend returned ${res.status}`);
  return data;
}

function getStore(env, deps = {}) {
  if (deps.store) return deps.store;
  return createFirestoreStore(env, deps);
}

function createFirestoreStore(env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const projectId = env.FIREBASE_PROJECT_ID || 'wocult-tasks';
  const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  return {
    async getCandidate(id) {
      const res = await firestoreFetch(`${root}/news_brief_automation/${encodeURIComponent(id)}`, env, fetchImpl);
      if (res.status === 404) return null;
      const data = await res.json();
      return fromFirestoreDoc(data);
    },
    async existsByFingerprint(fingerprint) {
      const body = structuredQuery('news_brief_automation', [{ field: 'storyFingerprint', op: 'EQUAL', value: fingerprint }], 1);
      const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
      const rows = await res.json();
      return rows.some((r) => r.document);
    },
    async isDeclinedSuppressed(cKey) {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
      const body = structuredQuery('news_brief_automation', [
        { field: 'clusterKey', op: 'EQUAL', value: cKey },
        { field: 'status', op: 'EQUAL', value: 'declined' },
        { field: 'decisionTimestamp', op: 'GREATER_THAN', value: cutoff },
      ], 1);
      const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
      const rows = await res.json();
      return rows.some((r) => r.document);
    },
    async saveCandidate(candidate, options = {}) {
      const id = candidate.candidateId || candidate.id;
      const target = new URL(`${root}/news_brief_automation/${encodeURIComponent(id)}`);
      if (options.updateTime) target.searchParams.set('currentDocument.updateTime', options.updateTime);
      let existing = options.existingCandidate || null;
      if (!existing) {
        try {
          existing = await this.getCandidate(id);
        } catch (e) {
          existing = null;
        }
      }
      const storedCandidate = withCandidateMetadata(candidate, existing, { runId: options.runId });
      const res = await firestoreFetch(target.toString(), env, fetchImpl, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFirestoreFields(storedCandidate) }),
      });
      return fromFirestoreDoc(await res.json());
    },
    async addActivity(candidateId, type, data = {}) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await firestoreFetch(`${root}/news_brief_automation/${encodeURIComponent(candidateId)}/activity/${id}`, env, fetchImpl, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFirestoreFields({ type, ...data, createdAt: new Date().toISOString() }) }),
      });
    },
    async saveRun(summary) {
      await firestoreFetch(`${root}/news_brief_automation_runs/${encodeURIComponent(summary.runId)}`, env, fetchImpl, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFirestoreFields(summary) }),
      });
    },
    async createArticle(article, idempotencyKey) {
      const id = stableHash(idempotencyKey);
      await firestoreFetch(`${root}/articles/${id}`, env, fetchImpl, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFirestoreFields({ ...article, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) }),
      });
      return id;
    },
    async transactionDecision(payload, fn) {
      const candidate = await this.getCandidate(payload.candidateId);
      if ((candidate?.usedApprovalNonces || []).includes(payload.nonce)) return { ok: false, error: 'token_reused' };
      const result = await fn(candidate);
      if (result.ok && result.candidate) {
        try {
          await this.saveCandidate(result.candidate, { updateTime: candidate?._updateTime, existingCandidate: candidate, runId: result.candidate.lastProcessedRunId || result.candidate.runId });
        } catch (e) {
          if (/Firestore 409|Firestore 412|ABORTED|FAILED_PRECONDITION/i.test(e.message || '')) {
            return { ok: false, error: 'decision_conflict', message: 'This item has already been changed by another decision.' };
          }
          throw e;
        }
      }
      return result;
    },
    async statusCounts() {
      const counts = {};
      await Promise.all(AUTOMATION_STATUSES.concat(['failed']).map(async (status) => {
        if (status === 'failed') {
          counts.failed = 0;
          for (const failedStatus of ['qualification_failed', 'verification_failed', 'drafting_failed', 'webflow_failed']) {
            counts.failed += await this.countByStatus(failedStatus);
          }
          return;
        }
        counts[status] = await this.countByStatus(status);
      }));
      return counts;
    },
    async countByStatus(status) {
      const body = structuredQuery('news_brief_automation', [{ field: 'status', op: 'EQUAL', value: status }], 1000);
      const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
      const rows = await res.json();
      return rows.filter((r) => r.document).length;
    },
    async latestRuns(limit = 10) {
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'news_brief_automation_runs' }],
          orderBy: [{ field: { fieldPath: 'startTime' }, direction: 'DESCENDING' }],
          limit,
        },
      };
      const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
      const rows = await res.json();
      return rows.filter((r) => r.document).map((r) => fromFirestoreDoc(r.document));
    },
  };
}

async function firestoreFetch(url, env, fetchImpl, init = {}) {
  const token = await getFirestoreAccessToken(env, fetchImpl);
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Firestore ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

let cachedFirestoreToken = null;
async function getFirestoreAccessToken(env, fetchImpl = fetch) {
  if (env.FIREBASE_ACCESS_TOKEN) return env.FIREBASE_ACCESS_TOKEN;
  if (cachedFirestoreToken && cachedFirestoreToken.exp > Date.now() + 60000) return cachedFirestoreToken.token;
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('Firebase service-account secrets are required');
  const iat = Math.floor(Date.now() / 1000);
  const assertion = await createJwt({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  }, env.FIREBASE_PRIVATE_KEY);
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firebase OAuth failed: ${data.error || res.status}`);
  cachedFirestoreToken = { token: data.access_token, exp: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedFirestoreToken.token;
}

async function createJwt(claims, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const body = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(privateKeyPem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  return `${body}.${base64UrlBytes(new Uint8Array(sig))}`;
}

async function verifyFirebaseIdToken(token, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const res = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_WEB_API_KEY || ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  const data = await res.json();
  if (!res.ok || !data.users?.[0]) throw new Error('Invalid Firebase ID token');
  return { email: data.users[0].email, uid: data.users[0].localId };
}

async function recordAttempt(env, candidateId, type, data, deps = {}) {
  try {
    await getStore(env, deps).addActivity(candidateId, type, data);
  } catch (e) {}
}

function structuredQuery(collection, filters, limit = 20) {
  return {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: filters.map((f) => ({
            fieldFilter: {
              field: { fieldPath: f.field },
              op: f.op,
              value: toFirestoreValue(f.value),
            },
          })),
        },
      },
      limit,
    },
  };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj || {})) fields[key] = toFirestoreValue(value, key);
  return fields;
}

function toFirestoreValue(value, key = '') {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && /(At|Timestamp|Time|Date)$/i.test(key)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map((entry) => toFirestoreValue(entry)) } };
  if (typeof value === 'object') return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function fromFirestoreDoc(doc) {
  if (!doc?.fields) return null;
  const out = {};
  for (const [key, value] of Object.entries(doc.fields)) out[key] = fromFirestoreValue(value);
  out.id = doc.name?.split('/').pop() || out.candidateId;
  out._updateTime = doc.updateTime || '';
  out._createTime = doc.createTime || '';
  return out;
}

function fromFirestoreValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const out = {};
    for (const [key, val] of Object.entries(v.mapValue.fields || {})) out[key] = fromFirestoreValue(val);
    return out;
  }
  return null;
}

function redactConfig(config) {
  return {
    automationEnabled: config.automationEnabled,
    emailEnabled: config.emailEnabled,
    webflowEnabled: config.webflowEnabled,
    dryRun: config.dryRun,
    minScore: config.minScore,
    activeStartHourIst: config.activeStartHourIst,
    activeEndHourIst: config.activeEndHourIst,
    maxItemsPerRun: config.maxItemsPerRun,
    maxConcurrentDrafts: config.maxConcurrentDrafts,
    heldReminderEnabled: config.heldReminderEnabled,
  };
}

function flag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function numberEnv(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function csv(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function clean(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toSentenceCaseHeadline(text) {
  let s = String(text || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  ['AI', 'HR', 'CEO', 'CFO', 'CHRO', 'CTO', 'COO', 'CIO', 'IT', 'PF', 'EPF', 'EPFO', 'ESIC', 'POSH', 'TCS', 'HUL', 'RBI', 'SEBI', 'IPO', 'MSME', 'U.S.', 'US', 'UK', 'H-1B'].forEach((term) => {
    s = s.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi'), term);
  });
  return s;
}

function stripEmptyOptionalFields(fieldData) {
  const cleaned = {};
  for (const [key, value] of Object.entries(fieldData || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim() && key !== 'name' && key !== 'slug') continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function normalizeText(value) {
  return clean(value).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isUsableUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function canonicalizeUrl(value) {
  try {
    const u = new URL(value);
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach((k) => u.searchParams.delete(k));
    return u.toString().replace(/\/$/, '');
  } catch (e) {
    return clean(value);
  }
}

function parseDateMs(value) {
  if (!value) return 0;
  const raw = String(value).trim();
  const sheetDate = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (sheetDate) {
    const year = Number(sheetDate[3]) < 100 ? Number(sheetDate[3]) + 2000 : Number(sheetDate[3]);
    return new Date(year, Number(sheetDate[2]) - 1, Number(sheetDate[1]), Number(sheetDate[4] || 0), Number(sheetDate[5] || 0)).getTime();
  }
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function extractLikelyOrganisation(item) {
  const text = `${item.headline || ''} ${item.source || ''}`;
  const m = text.match(/\b([A-Z][A-Za-z0-9&.-]{2,}(?:\s+[A-Z][A-Za-z0-9&.-]{2,}){0,2})\b/);
  return normalizeText(m ? m[1] : item.source || '');
}

function lowRisk(candidate) {
  const text = `${candidate.headline || ''} ${candidate.theme || ''}`.toLowerCase();
  return !/(court|law|death|suicide|harassment|criminal|fraud|mass layoff|thousand|legal)/i.test(text);
}

function detectConflicts(sources) {
  const figures = new Map();
  for (const source of sources) {
    const text = `${source.text || source.excerpt || ''}`;
    const matches = text.match(/\b\d{2,6}\b/g) || [];
    matches.slice(0, 10).forEach((m) => figures.set(m, (figures.get(m) || 0) + 1));
  }
  return figures.size > 5 ? ['multiple_unreconciled_figures'] : [];
}

function extractConfirmedFacts(sources) {
  return sources.map((s) => stripHtml(s.excerpt || s.text || '').split(/[.!?]/).find(Boolean)).filter(Boolean).slice(0, 6);
}

function stableHash(value) {
  let h = 2166136261;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function parseJsonFromText(text, forgiving = false) {
  try {
    return attachRawModelResponse(JSON.parse(text), text);
  } catch (e) {
    const s = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a !== -1 && b !== -1) return attachRawModelResponse(JSON.parse(s.slice(a, b + 1)), text);
    if (forgiving) return {};
    throw e;
  }
}

function attachRawModelResponse(value, raw) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.defineProperty(value, 'rawModelResponse', {
      value: String(raw || ''),
      enumerable: false,
      configurable: true,
    });
  }
  return value;
}

function sanitizeQualificationForStorage(qualification) {
  if (!qualification || typeof qualification !== 'object' || Array.isArray(qualification)) return qualification;
  const { rawModelResponse, ...stored } = qualification;
  return stored;
}

function safeModelDiagnostic(value) {
  return String(value || '').slice(0, 4000);
}

function normalizeEnumValue(value, mapping) {
  if (typeof value !== 'string') return value;
  const key = value
    .trim()
    .replace(/[.。]+$/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : value;
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function isActiveHourIst(date, config) {
  const ist = new Date(date.getTime() + 5.5 * 3600000);
  const hour = ist.getUTCHours();
  return hour >= config.activeStartHourIst && hour <= config.activeEndHourIst;
}

async function hmacSha256(value, secret, cryptoImpl) {
  const key = await cryptoImpl.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await cryptoImpl.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlBytes(new Uint8Array(sig));
}

function base64Url(value) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function textFromBase64Url(value) {
  const s = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function constantTimeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i += 1) diff |= x.charCodeAt(i % x.length || 0) ^ y.charCodeAt(i % y.length || 0);
  return diff === 0;
}

function cryptoRandom() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlBytes(bytes);
}

function pemToArrayBuffer(pem) {
  const normalised = String(pem || '').replace(/\\n/g, '\n');
  const b64 = normalised.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function createMessageHtml(title, detail) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;background:#f8f6ef;margin:0;padding:24px}.box{max-width:680px;margin:0 auto;background:#fff;border:1px solid #e6e1d5;border-radius:8px;padding:22px}</style></head><body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail || '')}</p></div></body></html>`;
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return {};
  }
}
