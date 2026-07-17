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

export const PRIMARY_SOURCE_TYPES = [
  'government_report',
  'government_notification',
  'regulator_circular',
  'court_order',
  'court_judgment',
  'official_dataset',
  'company_filing',
  'stock_exchange_disclosure',
  'company_announcement',
  'press_release',
  'research_paper',
  'survey_report',
  'think_tank_report',
  'industry_report',
  'official_transcript',
  'policy_document',
  'union_statement',
  'original_interview',
  'other_primary_source',
];

const PRIMARY_SOURCE_RELATIONSHIPS = ['based_on', 'reports_findings_from', 'announces', 'responds_to', 'analyses', 'cites', 'summarises', 'unclear'];
const PRIMARY_SOURCE_DISCOVERY_METHODS = ['directly_linked_by_article', 'article_text_reference', 'official_site_search', 'web_search', 'document_title_search', 'organisation_search', 'statistic_match', 'manual_staff_entry'];
const PRIMARY_SOURCE_DISCOVERY_STATUSES = ['not_required', 'pending', 'found', 'multiple_found', 'not_found', 'ambiguous', 'failed'];
const PRIMARY_SOURCE_FAILURE_CODES = ['primary_source_not_found', 'primary_source_ambiguous', 'primary_source_url_invalid', 'primary_source_unreachable', 'primary_source_content_mismatch', 'primary_source_verification_failed'];
const WEBFLOW_NEWS_COLLECTION_ID = '6a4d6ad32871d46ed1edc6a4';
const WOCULT_HEADLINE_EXACT_THRESHOLD = 0.92;
const WOCULT_HEADLINE_HIGH_THRESHOLD = 0.72;
const WOCULT_HEADLINE_POSSIBLE_THRESHOLD = 0.5;

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
    dateFound: clean(item.dateFound || item.foundDate || item.discoveredAt || item.discoveredTimestamp || item.dateFoundTimestamp || ''),
    headline,
    source: clean(item.source || item.publisher || item.src || ''),
    sourceUrl: clean(sourceUrl),
    publicationDate: clean(item.publicationDate || item.publishedAt || item.datePublished || item.publishedDate || item.pubDate || item.pub || item.date || ''),
    theme: clean(item.theme || ''),
    priority: clean(item.priority || ''),
    suggestedFormat: clean(item.suggestedFormat || item.format || ''),
    whyItMatters: clean(item.whyItMatters || item.why || ''),
    verification: clean(item.verification || item.verificationInfo || ''),
    status: clean(item.status || ''),
    owner: clean(item.owner || ''),
    publishedLink: clean(item.publishedLink || item.wocultPublishedLink || ''),
    imageUrl: clean(item.imageUrl || item.image || ''),
    primarySourceUrl: clean(item.primarySourceUrl || item.primarySourceURL || item['primary-source-url'] || ''),
    primarySourceUrls: Array.isArray(item.primarySourceUrls) ? item.primarySourceUrls.map(clean).filter(Boolean) : csv(item.primarySourceUrls || item['primary-source-urls'] || ''),
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

export function sortNewsTrackerItemsNewestFirst(items = []) {
  return [...items].map((item, originalIndex) => ({
    item,
    originalIndex,
    order: newsTrackerItemOrder(item, originalIndex),
  })).sort((a, b) => {
    if (a.order.timestamp && b.order.timestamp) {
      if (b.order.timestamp !== a.order.timestamp) return b.order.timestamp - a.order.timestamp;
      return a.originalIndex - b.originalIndex;
    }
    if (a.order.timestamp || b.order.timestamp) return a.order.timestamp ? -1 : 1;
    if (a.order.rowOrder !== null && b.order.rowOrder !== null && b.order.rowOrder !== a.order.rowOrder) {
      return b.order.rowOrder - a.order.rowOrder;
    }
    return a.originalIndex - b.originalIndex;
  }).map((entry) => entry.item);
}

function newsTrackerItemOrder(item = {}, originalIndex = 0) {
  const timestamp =
    firstValidTimestamp(item, ['publicationDate', 'publishedAt', 'datePublished', 'publishedDate', 'pubDate', 'pub', 'date'])
    || firstValidTimestamp(item, ['dateFound', 'foundDate', 'discoveredAt', 'discoveredTimestamp', 'dateFoundTimestamp'])
    || firstValidTimestamp(item, ['timestamp', 'createdAt', 'emailDate', 'insertedAt']);
  return {
    timestamp,
    rowOrder: timestamp ? null : firstNumericField(item, ['rowNumber', 'row', 'sourceRow', 'index']),
    originalIndex,
  };
}

function firstValidTimestamp(item, fields) {
  for (const field of fields) {
    const value = item?.[field] ?? item?.raw?.[field];
    const timestamp = parseDateMs(value);
    if (timestamp) return timestamp;
  }
  return 0;
}

function firstNumericField(item, fields) {
  for (const field of fields) {
    const value = item?.[field] ?? item?.raw?.[field];
    if (value === undefined || value === null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
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
  const primary = accessible.find((s) => /primary|official|filing|government|court|regulator|company|research|report|circular|dataset|policy|release|judgment|judgement/i.test(s.type || s.publisher || s.url));
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

export function primarySourceDiscoveryRequired(item = {}, qualification = null) {
  const text = [
    item.headline,
    item.theme,
    item.whyItMatters,
    item.verification,
    qualification?.recommendedAngle,
    ...(qualification?.materialFacts || []),
    ...(qualification?.qualificationReasons || []),
    ...(qualification?.missingInformation || []),
  ].join(' ').toLowerCase();
  return /(report|study|survey|filing|disclosure|court|judgment|order|tribunal|policy|notification|circular|dataset|data portal|ministry|regulator|sebi|rbi|nse|bse|parliament|gazette|press release|white paper|research|paper|doi|university|think tank|association|union|official|announcement)/i.test(text);
}

export async function discoverPrimarySources(item, qualification = null, env = {}, deps = {}, options = {}) {
  const runId = options.runId || '';
  const now = options.now || new Date().toISOString();
  if (!primarySourceDiscoveryRequired(item, qualification)) {
    return buildPrimarySourceDiscovery({
      status: 'not_required',
      notes: 'No external report, filing, order, dataset or official document dependency was detected.',
      runId,
      now,
    });
  }

  let articleFetch = { ok: false, text: '', html: '', links: [], error: '' };
  try {
    articleFetch = await fetchArticleForPrimaryDiscovery(item, deps);
  } catch (e) {
    return buildPrimarySourceDiscovery({
      status: 'failed',
      failureCode: 'primary_source_unreachable',
      notes: `Could not inspect article source for primary-source references: ${safeShortText(e.message, 180)}`,
      searchesAttempted: buildPrimarySourceSearchQueries(item, qualification).slice(0, 5),
      organisationsChecked: inferPrimarySourceOrganisations(item, qualification),
      runId,
      now,
    });
  }

  const directSources = [];
  for (const source of findPrimarySourceLinksInArticle(item, articleFetch)) {
    const verified = await verifyPrimarySourceCandidate(source, item, articleFetch.text, deps);
    if (verified.accepted) directSources.push(verified.source);
  }
  if (directSources.length) {
    return buildPrimarySourceDiscovery({
      status: directSources.length > 1 ? 'multiple_found' : 'found',
      primarySources: directSources,
      notes: `Found ${directSources.length} primary source${directSources.length === 1 ? '' : 's'} directly referenced by the article.`,
      searchesAttempted: ['article outbound link inspection'],
      organisationsChecked: inferPrimarySourceOrganisations(item, qualification),
      runId,
      now,
    });
  }

  try {
    const searchResult = deps.primarySourceSearch
      ? await deps.primarySourceSearch({ item, qualification, articleText: articleFetch.text, queries: buildPrimarySourceSearchQueries(item, qualification) })
      : await callClaudeJson(env, buildPrimarySourceDiscoveryPrompt(item, qualification, articleFetch.text), 1200, deps);
    const candidates = Array.isArray(searchResult?.primarySources) ? searchResult.primarySources : [];
    const accepted = [];
    const rejectedNotes = [];
    for (const candidate of candidates.slice(0, 5)) {
      const verified = await verifyPrimarySourceCandidate(candidate, item, articleFetch.text, deps);
      if (verified.accepted) accepted.push(verified.source);
      else rejectedNotes.push(verified.reason);
    }
    if (accepted.length) {
      return buildPrimarySourceDiscovery({
        status: accepted.length > 1 ? 'multiple_found' : 'found',
        primarySources: accepted,
        notes: safeShortText(searchResult?.notes || `Found ${accepted.length} primary-source candidate${accepted.length === 1 ? '' : 's'} through search.`, 420),
        searchesAttempted: conciseList(searchResult?.searchesAttempted || buildPrimarySourceSearchQueries(item, qualification), 8),
        organisationsChecked: conciseList(searchResult?.organisationsChecked || inferPrimarySourceOrganisations(item, qualification), 8),
        runId,
        now,
      });
    }
    const status = candidates.length > 1 ? 'ambiguous' : 'not_found';
    return buildPrimarySourceDiscovery({
      status,
      failureCode: status === 'ambiguous' ? 'primary_source_ambiguous' : 'primary_source_not_found',
      notes: safeShortText(searchResult?.notes || rejectedNotes.filter(Boolean).join('; ') || 'No authoritative primary source could be verified.', 420),
      searchesAttempted: conciseList(searchResult?.searchesAttempted || buildPrimarySourceSearchQueries(item, qualification), 8),
      organisationsChecked: conciseList(searchResult?.organisationsChecked || inferPrimarySourceOrganisations(item, qualification), 8),
      runId,
      now,
    });
  } catch (e) {
    return buildPrimarySourceDiscovery({
      status: 'failed',
      failureCode: 'primary_source_verification_failed',
      notes: `Primary-source discovery failed safely: ${safeShortText(e.message, 180)}`,
      searchesAttempted: buildPrimarySourceSearchQueries(item, qualification).slice(0, 5),
      organisationsChecked: inferPrimarySourceOrganisations(item, qualification),
      runId,
      now,
    });
  }
}

export function applyPrimarySourceDiscovery(candidate, discovery, existing = null) {
  const manualSources = (existing?.primarySources || candidate.primarySources || [])
    .filter((source) => source?.discoveryMethod === 'manual_staff_entry' || source?.manual === true);
  const automaticSources = discovery?.primarySources || [];
  const primarySources = mergePrimarySources(manualSources, automaticSources);
  const firstVerified = primarySources.find((source) => source.verified) || null;
  return {
    ...candidate,
    articleSourceUrl: candidate.articleSourceUrl || candidate.canonicalUrl || candidate.trackerItem?.sourceUrl || '',
    articleSourceName: candidate.articleSourceName || candidate.trackerItem?.source || candidate.publishers?.[0] || '',
    primarySourceFound: primarySources.length > 0,
    primarySources,
    primarySourceUrl: firstVerified?.url || '',
    supportingSourceUrls: mergeUrlLists(candidate.supportingSourceUrls || [], primarySources.map((source) => source.url)),
    primarySourceDiscoveryStatus: discovery?.status || 'pending',
    primarySourceDiscoveryAt: discovery?.discoveredAt || new Date().toISOString(),
    primarySourceDiscoveryRunId: discovery?.runId || candidate.runId || '',
    primarySourceDiscoveryNotes: discovery?.notes || '',
    primarySourceDiscoveryFailureCode: discovery?.failureCode || '',
    failureStage: discovery?.status === 'failed' ? 'primary_source_discovery' : candidate.failureStage || '',
    lastSuccessfulStage: ['found', 'multiple_found', 'not_found', 'ambiguous', 'not_required'].includes(discovery?.status) ? 'primary_source_discovery' : candidate.lastSuccessfulStage || '',
    primarySourceSearchesAttempted: conciseList(discovery?.searchesAttempted || [], 8),
    primarySourceOrganisationsChecked: conciseList(discovery?.organisationsChecked || [], 8),
    sourceChain: {
      newsTracker: candidate.newsTrackerSourceId || candidate.trackerItem?.sourceId || '',
      articleSource: {
        name: candidate.articleSourceName || candidate.trackerItem?.source || '',
        url: candidate.articleSourceUrl || candidate.canonicalUrl || '',
        headline: candidate.originalHeadline || candidate.trackerItem?.headline || '',
        publicationDate: candidate.sourcePublishedTimestamp || '',
        discoveredAt: candidate.discoveredTimestamp || '',
      },
      primarySources,
    },
  };
}

function buildPrimarySourceDiscovery(payload = {}) {
  const status = PRIMARY_SOURCE_DISCOVERY_STATUSES.includes(payload.status) ? payload.status : 'failed';
  const sources = (payload.primarySources || []).map(sanitizePrimarySource).filter(Boolean);
  return {
    status: sources.length > 1 && status === 'found' ? 'multiple_found' : status,
    primarySources: sources,
    notes: safeShortText(payload.notes || '', 420),
    searchesAttempted: conciseList(payload.searchesAttempted || [], 8),
    organisationsChecked: conciseList(payload.organisationsChecked || [], 8),
    failureCode: PRIMARY_SOURCE_FAILURE_CODES.includes(payload.failureCode) ? payload.failureCode : '',
    discoveredAt: payload.now || new Date().toISOString(),
    runId: payload.runId || '',
  };
}

function sanitizePrimarySource(source = {}) {
  const url = canonicalizeUrl(source.url || source.href || '');
  if (!isUsableUrl(url)) return null;
  const sourceType = PRIMARY_SOURCE_TYPES.includes(source.sourceType) ? source.sourceType : 'other_primary_source';
  const relationship = PRIMARY_SOURCE_RELATIONSHIPS.includes(source.relationship) ? source.relationship : 'unclear';
  const discoveryMethod = PRIMARY_SOURCE_DISCOVERY_METHODS.includes(source.discoveryMethod) ? source.discoveryMethod : 'web_search';
  const confidence = ['high', 'medium', 'low'].includes(source.confidence) ? source.confidence : 'low';
  return stripEmptyOptionalFields({
    title: safeShortText(source.title || source.name || '', 180),
    url,
    publisherOrIssuer: safeShortText(source.publisherOrIssuer || source.issuer || source.publisher || '', 140),
    sourceType,
    publicationDate: safeShortText(source.publicationDate || source.date || '', 80),
    relationship,
    discoveryMethod,
    confidence,
    verified: source.verified === true,
    verificationNote: safeShortText(source.verificationNote || '', 260),
    confirmedByStaff: source.confirmedByStaff === true,
    rejectedByStaff: source.rejectedByStaff === true,
    manual: source.manual === true || discoveryMethod === 'manual_staff_entry',
  });
}

async function fetchArticleForPrimaryDiscovery(item, deps = {}) {
  const articleUrl = item.sourceUrl || item.link || item.url || '';
  if (!articleUrl) return { ok: false, text: '', html: '', links: [], error: 'missing_article_url' };
  const fetchImpl = deps.fetch || fetch;
  const res = await fetchWithTimeout(articleUrl, { headers: { 'User-Agent': 'WocultIntelligence/1.0 by Wocult' } }, 12000, fetchImpl);
  const html = await res.text();
  const prepared = prepareSourceContext(html, MAX_ARTICLE_TEXT_CHARS);
  return {
    ok: res.ok,
    text: prepared.text,
    textTruncated: prepared.truncated,
    html: html.slice(0, 60000),
    links: extractLinks(html, articleUrl).slice(0, 80),
    error: res.ok ? '' : `article_fetch_${res.status}`,
  };
}

function findPrimarySourceLinksInArticle(item, articleFetch) {
  const articleUrl = item.sourceUrl || item.link || item.url || '';
  const articleHost = hostName(articleUrl);
  return (articleFetch.links || []).filter((link) => {
    if (!isUsableUrl(link.url)) return false;
    if (canonicalizeUrl(link.url) === canonicalizeUrl(articleUrl)) return false;
    const host = hostName(link.url);
    if (!host || host === articleHost) return false;
    return isAuthoritativePrimaryDomain(host) || primarySourceTypeFromUrl(link.url, link.text) !== 'other_primary_source';
  }).map((link) => ({
    title: link.text || link.url,
    url: link.url,
    publisherOrIssuer: issuerFromHost(link.url),
    sourceType: primarySourceTypeFromUrl(link.url, link.text),
    relationship: 'cites',
    discoveryMethod: 'directly_linked_by_article',
    confidence: isAuthoritativePrimaryDomain(hostName(link.url)) ? 'high' : 'medium',
  }));
}

async function verifyPrimarySourceCandidate(candidate, item, articleText = '', deps = {}) {
  const source = sanitizePrimarySource(candidate);
  if (!source) return { accepted: false, reason: 'primary_source_url_invalid' };
  const articleUrl = item.sourceUrl || item.link || item.url || '';
  if (canonicalizeUrl(source.url) === canonicalizeUrl(articleUrl)) return { accepted: false, reason: 'secondary media article is not a primary source' };
  const host = hostName(source.url);
  if (hostName(articleUrl) === host && source.discoveryMethod !== 'manual_staff_entry') return { accepted: false, reason: 'publisher article domain cannot verify itself as primary source' };
  if (isLikelySecondaryMediaDomain(host) && !['original_interview', 'press_release'].includes(source.sourceType)) {
    return { accepted: false, reason: 'secondary media source rejected as primary' };
  }
  let text = '';
  let fetchError = '';
  try {
    const fetchImpl = deps.fetch || fetch;
    const res = await fetchWithTimeout(source.url, { headers: { 'User-Agent': 'WocultIntelligence/1.0 by Wocult' } }, 12000, fetchImpl);
    text = prepareSourceContext(await res.text(), MAX_PRIMARY_SOURCE_TEXT_CHARS).text;
    if (!res.ok) fetchError = `primary_source_fetch_${res.status}`;
  } catch (e) {
    fetchError = e.message;
  }
  if (fetchError && source.discoveryMethod !== 'manual_staff_entry') return { accepted: false, reason: 'primary_source_unreachable' };
  const support = primarySourceSupportsClaim(source, item, text, articleText);
  if (!support.ok && source.discoveryMethod !== 'manual_staff_entry') return { accepted: false, reason: 'primary_source_content_mismatch' };
  return {
    accepted: true,
    source: {
      ...source,
      verified: source.verified === true || support.ok,
      confidence: source.confidence === 'high' || support.ok ? source.confidence : 'low',
      verificationNote: source.verificationNote || support.note,
    },
  };
}

function primarySourceSupportsClaim(source, item, sourceText, articleText = '') {
  const haystack = normalizeText(`${source.title} ${source.publisherOrIssuer} ${sourceText}`);
  const content = normalizeText(sourceText);
  const article = normalizeText(articleText);
  const titleTerms = normalizeText(`${item.headline || ''} ${item.theme || ''}`).split(' ').filter((term) => term.length > 4).slice(0, 10);
  const overlap = titleTerms.filter((term) => haystack.includes(term)).length;
  const contentOverlap = titleTerms.filter((term) => content.includes(term)).length;
  const issuerMatch = source.publisherOrIssuer && content.includes(normalizeText(source.publisherOrIssuer).split(' ')[0] || '');
  const statMatches = (String(articleText || '').match(/\b\d+(?:\.\d+)?%?|\b\d{2,}(?:,\d{3})*\b/g) || [])
    .slice(0, 8)
    .filter((value) => sourceText.includes(value)).length;
  const official = isAuthoritativePrimaryDomain(hostName(source.url));
  if (official && (contentOverlap >= 1 || issuerMatch || statMatches >= 1 || !sourceText)) {
    return { ok: true, note: 'Official or authoritative source matched article context.' };
  }
  if ((contentOverlap >= 3 && overlap >= 3) || statMatches >= 2) return { ok: true, note: 'Primary source content matched central article terms or statistics.' };
  return { ok: false, note: 'Primary-source candidate did not sufficiently support the central claim.' };
}

export function buildPrimarySourceDiscoveryPrompt(item, qualification, articleText) {
  const context = prepareSourceContext(articleText, MAX_SEARCH_CONTEXT_CHARS);
  return `Find the original or primary source behind this publisher article. Return ONLY JSON with:
{"primarySources":[{"title":"","url":"","publisherOrIssuer":"","sourceType":"government_report","publicationDate":"","relationship":"based_on","discoveryMethod":"web_search","confidence":"medium","verified":false,"verificationNote":""}],"searchesAttempted":[],"organisationsChecked":[],"notes":""}

Rules:
- Do not return the publisher article URL as a primary source.
- Prefer official domains, regulator/court/company filings, official PDFs, datasets, DOI pages or report landing pages.
- Return an empty primarySources array when no authoritative URL can be verified.
- Do not include raw search result pages or scraped text.

Article source:
${JSON.stringify({ headline: item.headline, source: item.source, sourceUrl: item.sourceUrl, date: item.publicationDate || item.dateFound, qualification }, null, 2)}

Article text excerpt:
${context.text}

Context notes:
${context.truncated ? 'Article text was deduplicated and truncated for token control.' : 'Article text was deduplicated without truncation.'}`;
}

export function buildPrimarySourceSearchQueries(item, qualification = null) {
  const pieces = [
    item.headline,
    item.source,
    item.theme,
    qualification?.recommendedAngle,
    ...(qualification?.materialFacts || []),
  ].filter(Boolean).map((value) => safeShortText(value, 120));
  const seen = new Set();
  return [
    `${item.headline || ''} official report`,
    `${item.headline || ''} PDF`,
    `${pieces.join(' ')} site:gov.in`,
    `${pieces.join(' ')} filing disclosure`,
    `${pieces.join(' ')} court order notification circular`,
  ].map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
}

function inferPrimarySourceOrganisations(item, qualification = null) {
  const text = `${item.headline || ''} ${item.theme || ''} ${item.whyItMatters || ''} ${(qualification?.materialFacts || []).join(' ')}`;
  const known = text.match(/\b(SEBI|RBI|EPFO|ESIC|NSE|BSE|Supreme Court|High Court|Ministry of [A-Za-z ]+|Government of India|Parliament|Lok Sabha|Rajya Sabha)\b/gi) || [];
  return conciseList(known, 8);
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || '')))) {
    try {
      links.push({
        url: new URL(match[1], baseUrl).toString(),
        text: stripHtml(match[2]).slice(0, 180),
      });
    } catch (e) {
      // Ignore malformed article links.
    }
  }
  return links;
}

function primarySourceTypeFromUrl(url, text = '') {
  const value = `${url || ''} ${text || ''}`.toLowerCase();
  if (/judgment|judgement/.test(value)) return 'court_judgment';
  if (/court|tribunal|order/.test(value)) return 'court_order';
  if (/circular|regulator|sebi|rbi/.test(value)) return 'regulator_circular';
  if (/notification|gazette/.test(value)) return 'government_notification';
  if (/dataset|data\.gov|csv|xlsx/.test(value)) return 'official_dataset';
  if (/filing|disclosure|nseindia|bseindia|sec\.gov/.test(value)) return 'stock_exchange_disclosure';
  if (/press[- ]release|announcement/.test(value)) return 'press_release';
  if (/doi\.org|journal|research|paper/.test(value)) return 'research_paper';
  if (/survey/.test(value)) return 'survey_report';
  if (/policy/.test(value)) return 'policy_document';
  if (/report|pdf/.test(value)) return hostName(url).endsWith('.gov.in') ? 'government_report' : 'other_primary_source';
  return 'other_primary_source';
}

function isAuthoritativePrimaryDomain(host) {
  return /\.(gov|gov\.in|nic\.in|edu|ac\.in)$/i.test(host)
    || /(sebi\.gov\.in|rbi\.org\.in|nseindia\.com|bseindia\.com|indiacode\.nic\.in|egazette|sci\.gov\.in|indiancourts|mca\.gov\.in|data\.gov\.in|doi\.org|sec\.gov)$/i.test(host)
    || /(investor|investors|ir)\./i.test(host);
}

function isLikelySecondaryMediaDomain(host) {
  return /(economictimes|moneycontrol|ndtv|business-standard|livemint|hindustantimes|indianexpress|timesofindia|news18|firstpost|thehindu|reuters|bloomberg|bbc|cnn|forbes|fortune)\./i.test(host);
}

function issuerFromHost(url) {
  const host = hostName(url).replace(/^www\./, '');
  return host.split('.').slice(0, -1).join('.').replace(/[-.]/g, ' ');
}

function hostName(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

function mergePrimarySources(...groups) {
  const seen = new Set();
  const out = [];
  groups.flat().forEach((source) => {
    const cleanSource = sanitizePrimarySource(source);
    if (!cleanSource) return;
    const key = canonicalizeUrl(cleanSource.url);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleanSource);
  });
  return out.slice(0, 8);
}

function mergeUrlLists(...groups) {
  return [...new Set(groups.flat().filter(Boolean).map(canonicalizeUrl).filter(isUsableUrl))].slice(0, 12);
}

function conciseList(values, limit = 8) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => safeShortText(value, 160)).filter(Boolean))].slice(0, limit);
}

function safeShortText(value, max = 240) {
  return clean(value).slice(0, max);
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
  const tracker = normalizeNewsTrackerResponse(await res.json());
  return { ...tracker, items: sortNewsTrackerItemsNewestFirst(tracker.items) };
}

export async function callClaudeJson(env, prompt, maxTokens = 1200, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const model = env.NEWS_BRIEF_CLAUDE_MODEL || 'claude-sonnet-4-6';
  const timeoutMs = Number(env.NEWS_BRIEF_ANTHROPIC_TIMEOUT_MS || DEFAULT_ANTHROPIC_TIMEOUT_MS);
  const stage = deps.failureStage || deps.stage || 'unknown';
  const webSearchMaxUses = Number(env.NEWS_BRIEF_WEB_SEARCH_MAX_USES_PER_CALL || deps.webSearchMaxUses || DEFAULT_WEB_SEARCH_MAX_USES_PER_CALL);
  const startedAtMs = Date.now();
  const callMeta = deps.beforeAnthropicCall ? await deps.beforeAnthropicCall({ model, maxTokens, stage }) : null;
  let res;
  try {
    res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: Number.isFinite(webSearchMaxUses) && webSearchMaxUses >= 0 ? webSearchMaxUses : DEFAULT_WEB_SEARCH_MAX_USES_PER_CALL }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_ANTHROPIC_TIMEOUT_MS, fetchImpl);
  } catch (e) {
    if (e?.name === 'AbortError' || e?.message === 'request_timeout') {
      e.failureCode = 'anthropic_timeout';
      e.failureStage = stage;
      if (deps.afterAnthropicCall) await deps.afterAnthropicCall({
        ...callMeta,
        model,
        maxTokens,
        stage,
        status: 'timed_out',
        failureCode: 'anthropic_timeout',
        durationMs: Date.now() - startedAtMs,
      });
    } else if (deps.afterAnthropicCall) {
      await deps.afterAnthropicCall({
        ...callMeta,
        model,
        maxTokens,
        stage,
        status: 'failed',
        failureCode: failureCodeForError(e, stage),
        durationMs: Date.now() - startedAtMs,
      });
    }
    throw e;
  }
  const data = await res.json();
  const usage = normalizeAnthropicUsage(data, model);
  if (deps.recordAnthropicUsage) deps.recordAnthropicUsage(usage);
  if (!res.ok || data.error) {
    const err = new Error(data.error?.message || `Anthropic returned ${res.status}`);
    err.failureCode = failureCodeForError(err, stage);
    err.failureStage = stage;
    if (deps.afterAnthropicCall) await deps.afterAnthropicCall({ ...callMeta, model, maxTokens, stage, status: 'failed', usage, failureCode: err.failureCode, durationMs: Date.now() - startedAtMs });
    throw err;
  }
  if (deps.afterAnthropicCall) await deps.afterAnthropicCall({ ...callMeta, model, maxTokens, stage, status: 'completed', usage, durationMs: Date.now() - startedAtMs });
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
  const safeCandidate = {
    item: {
      headline: candidate.item?.headline || candidate.originalHeadline || candidate.trackerItem?.headline || '',
      source: candidate.item?.source || candidate.articleSourceName || candidate.trackerItem?.source || '',
      sourceUrl: candidate.item?.sourceUrl || candidate.articleSourceUrl || candidate.canonicalUrl || '',
      date: candidate.item?.publicationDate || candidate.item?.dateFound || candidate.sourcePublishedTimestamp || candidate.discoveredTimestamp || '',
    },
    qualification: candidate.qualification,
    verification: candidate.verification ? {
      status: candidate.verification.status,
      summary: candidate.verification.summary,
      primarySourceUrl: candidate.verification.primarySourceUrl,
      supportingSourceUrls: candidate.verification.supportingSourceUrls,
      sourceTitles: candidate.verification.sourceTitles,
      publishers: candidate.verification.publishers,
      excerpts: (candidate.verification.excerpts || []).map((value) => prepareSourceContext(value, 500).text),
      confirmedFacts: candidate.verification.confirmedFacts,
    } : null,
    primarySources: (candidate.primarySources || []).map((source) => ({
      title: source.title,
      url: source.url,
      publisherOrIssuer: source.publisherOrIssuer,
      sourceType: source.sourceType,
      confidence: source.confidence,
      verified: source.verified,
      relationship: source.relationship,
    })),
    sourceContextTruncated: !!candidate.sourceContextTruncated,
  };
  return `Write a reported Wocult news brief after verification. Return ONLY valid JSON with title, slug, shortIntro, intro40, excerpt, standfirst, body, readTime, writerName, publishedDate, beat, sourceName, sourceUrl, imageUrl, seoDescription, wocultAngle, verificationNote.

Rules: 250-400 words, British English, fact-led, for working professionals, no invented quotes or unsupported numbers, valid HTML paragraphs in body only.

Candidate and verified sources:
${JSON.stringify(safeCandidate, null, 2)}`;
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
    articleSourceUrl: canonicalizeUrl(item.sourceUrl),
    articleSourceName: item.source,
    articleSourceHeadline: item.headline,
    articleSourcePublishedTimestamp: item.publicationDate || '',
    primarySourceUrl: verification?.primarySourceUrl || '',
    primarySourceFound: false,
    primarySources: [],
    primarySourceDiscoveryStatus: 'pending',
    primarySourceDiscoveryAt: '',
    primarySourceDiscoveryRunId: '',
    primarySourceDiscoveryNotes: '',
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
  if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  return null;
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
      const protectedResponse = await requireProtectedRoute(request, env, deps);
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

  const protectedResponse = await requireProtectedRoute(request, env, deps);
  if (protectedResponse) return protectedResponse;

  if (url.pathname === '/automation/news-briefs/run' && request.method === 'POST') {
    const body = await safeJson(request);
    const result = env[NEWS_BRIEF_WORKFLOW_BINDING] && !deps.disableWorkflow
      ? await startNewsBriefAutomationWorkflow(env, { triggerType: body.triggerType || 'manual', dryRun: body.dryRun, requestRunId: body.requestRunId || '' }, deps)
      : await runNewsBriefAutomation(env, { triggerType: body.triggerType || 'manual', dryRun: body.dryRun, requestRunId: body.requestRunId || '' }, deps);
    return json(result, result.status || (result.ok ? 200 : 500));
  }
  if (url.pathname === '/automation/news-briefs/status' && request.method === 'GET') {
    return json(await getAutomationStatus(env, deps, url.searchParams.get('runId') || ''));
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

const RUN_ID_PATTERN = /^run_[A-Za-z0-9_-]{8,96}$/;
const ACTIVE_RUN_STALE_MS = 20 * 60 * 1000;
const DEFAULT_ANTHROPIC_TIMEOUT_MS = 45000;
const MAX_ANTHROPIC_CALLS_PER_CANDIDATE = 4;
const MAX_ARTICLE_TEXT_CHARS = 2500;
const MAX_PRIMARY_SOURCE_TEXT_CHARS = 3000;
const MAX_SEARCH_CONTEXT_CHARS = 1800;
const MAX_PRIOR_RESPONSE_CHARS = 1200;
const MAX_TOTAL_SOURCE_CONTEXT_CHARS = 6000;
const DEFAULT_WEB_SEARCH_MAX_USES_PER_CALL = 2;
const NEWS_BRIEF_WORKFLOW_BINDING = 'NEWS_BRIEF_WORKFLOW';
const NEWS_BRIEF_CANDIDATE_WORKFLOW_BINDING = 'NEWS_BRIEF_CANDIDATE_WORKFLOW';
const NEWS_BRIEF_FINALIZER_WORKFLOW_BINDING = 'NEWS_BRIEF_FINALIZER_WORKFLOW';
const WORKFLOW_STATES = ['queued', 'running', 'retrying', 'completed', 'failed'];
const NEWS_BRIEF_WORKFLOW_STEP_CONFIG = {
  default: { retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
  anthropic: { retries: { limit: 1, delay: '15 seconds', backoff: 'exponential' }, timeout: '3 minutes' },
  noRetry: { retries: { limit: 0, delay: '1 second', backoff: 'constant' }, timeout: '2 minutes' },
};
export const FREE_PLAN_EXTERNAL_REQUEST_LIMIT = 50;
export const CANDIDATE_REQUEST_SOFT_LIMIT = 32;
export const CANDIDATE_FINALISATION_RESERVE = 6;
const COORDINATOR_OUTPUT_SOFT_LIMIT_BYTES = 1024 * 1024;

function createEmptyUsage() {
  return {
    anthropicCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    webSearchRequests: 0,
    models: [],
  };
}

function normalizeAnthropicUsage(data = {}, fallbackModel = '') {
  const usage = data.usage || {};
  return {
    anthropicCalls: 1,
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    cacheCreationInputTokens: Number(usage.cache_creation_input_tokens || 0),
    cacheReadInputTokens: Number(usage.cache_read_input_tokens || 0),
    webSearchRequests: Number(usage.server_tool_use?.web_search_requests || data.server_tool_use?.web_search_requests || 0),
    models: [data.model || fallbackModel].filter(Boolean),
  };
}

function addUsage(target, increment = {}) {
  target.anthropicCalls += Number(increment.anthropicCalls || 0);
  target.inputTokens += Number(increment.inputTokens || 0);
  target.outputTokens += Number(increment.outputTokens || 0);
  target.cacheCreationInputTokens += Number(increment.cacheCreationInputTokens || 0);
  target.cacheReadInputTokens += Number(increment.cacheReadInputTokens || 0);
  target.webSearchRequests += Number(increment.webSearchRequests || 0);
  target.models = [...new Set([...(target.models || []), ...(increment.models || [])].filter(Boolean))];
  return target;
}

function safeRandomId(prefix = 'call') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

function maxAnthropicCallLogLength(config) {
  return Math.max(10, Number(config?.maxItemsPerRun || 5) * MAX_ANTHROPIC_CALLS_PER_CANDIDATE);
}

function trimAnthropicCallLog(log, config) {
  const max = maxAnthropicCallLogLength(config);
  return (Array.isArray(log) ? log : []).slice(-max);
}

function progressPercent(completed, target) {
  if (!target) return null;
  return Math.min(100, Math.round((Number(completed || 0) / Number(target)) * 100));
}

function logicalRunState(run = {}) {
  return run.applicationState || run.state || '';
}

function activeRunIsRecent(run, now = Date.now()) {
  if (!run || !['preparing', 'running'].includes(logicalRunState(run))) return false;
  const heartbeat = Date.parse(run.heartbeatAt || run.updatedAt || run.startTime || '');
  return Number.isFinite(heartbeat) && now - heartbeat < ACTIVE_RUN_STALE_MS;
}

function activeRunIsStale(run, now = Date.now()) {
  return !!run && ['preparing', 'running'].includes(logicalRunState(run)) && !activeRunIsRecent(run, now);
}

function workflowStateIsActive(state) {
  return ['queued', 'running', 'retrying'].includes(normalizeWorkflowState(state));
}

function workflowStateIsTerminal(state) {
  return ['completed', 'failed'].includes(normalizeWorkflowState(state));
}

function staleRunMessage(run) {
  const count = Number(run?.completedItems || 0);
  const target = Number(run?.targetItems || 0);
  const progress = target ? `${progressPercent(count, target)}%` : 'unknown progress';
  return `Run heartbeat became stale before finalisation; preserving ${count}${target ? ` of ${target}` : ''} completed items (${progress}).`;
}

function staleFailureStage(run = {}) {
  return normalizeFailureStage(
    run.failureStage && run.failureStage !== 'unknown' ? run.failureStage
      : run.currentAnthropicStage
        || run.phase
        || run.lastSuccessfulStage
        || 'unknown'
  );
}

export async function startNewsBriefAutomationWorkflow(env, options = {}, deps = {}) {
  const config = getAutomationConfig(env);
  const dryRun = options.dryRun !== undefined ? !!options.dryRun : config.dryRun;
  const requested = options.requestRunId || '';
  if (!requested || !safeRunId(requested)) return { ok: false, status: 400, error: 'invalid_requestRunId' };
  const runId = requested;
  const workflowInstanceId = workflowInstanceIdForRun(runId);
  const store = getStore(env, deps);
  if (!env[NEWS_BRIEF_WORKFLOW_BINDING] || typeof env[NEWS_BRIEF_WORKFLOW_BINDING].create !== 'function') {
    return { ok: false, status: 500, error: 'workflow_binding_unavailable' };
  }
  if (store.getRun && await store.getRun(runId)) return { ok: false, status: 409, error: 'runId_already_exists', runId };
  let activeRun = store.activeRun ? await store.activeRun() : null;
  activeRun = await reconcileWorkflowRunState(env, store, activeRun, dryRun);
  if (workflowStateIsActive(activeRun?.workflowState)) {
    return { ok: false, status: 409, error: 'active_run_exists', activeRunId: activeRun.runId, state: activeRun.state, phase: activeRun.phase, workflowInstanceId: activeRun.workflowInstanceId || '', workflowState: activeRun.workflowState || '' };
  }
  if (activeRunIsStale(activeRun)) activeRun = await recoverStaleRun(store, activeRun, dryRun);
  if (activeRunIsRecent(activeRun)) {
    return { ok: false, status: 409, error: 'active_run_exists', activeRunId: activeRun.runId, state: activeRun.state, phase: activeRun.phase, workflowInstanceId: activeRun.workflowInstanceId || '', workflowState: activeRun.workflowState || '' };
  }
  const summary = createInitialRunSummary(runId, options, config, workflowInstanceId);
  await store.saveRun(summary, { dryRun, createOnly: true });
  let instance;
  try {
    instance = await env[NEWS_BRIEF_WORKFLOW_BINDING].create({
      id: workflowInstanceId,
      params: { runId, triggerType: options.triggerType || 'manual', dryRun },
    });
  } catch (e) {
    const failure = createFailureMetadata(e, 'unknown', runId);
    await store.saveRun({
      ...summary,
      state: 'failed',
      workflowState: 'failed',
      activeRun: false,
      endTime: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failureStage: failure.failureStage,
      failureCode: 'workflow_create_failed',
      failureMessage: safeShortText(e.message, 1000),
      errorSummary: [{ run: 'Workflow instance could not be created.', failureStage: failure.failureStage, failureCode: 'workflow_create_failed' }],
    }, { dryRun }).catch(() => {});
    return { ok: false, status: 500, error: 'workflow_create_failed', runId, workflowInstanceId, failureStage: failure.failureStage, failureCode: 'workflow_create_failed' };
  }
  const instanceId = instance?.id || workflowInstanceId;
  await store.saveRun({
    ...summary,
    coordinatorWorkflowInstanceId: instanceId,
    coordinatorWorkflowState: 'queued',
    workflowInstanceId: instanceId,
    workflowState: 'queued',
    workflowCreatedAt: summary.workflowCreatedAt,
    updatedAt: new Date().toISOString(),
  }, { dryRun });
  return {
    ok: true,
    accepted: true,
    status: 202,
    runId,
    coordinatorWorkflowInstanceId: instanceId,
    workflowInstanceId: instanceId,
    state: 'queued',
  };
}

function createEmptyExternalRequestUsage() {
  return {
    totalExternalFetches: 0,
    firebaseAuth: 0,
    firestoreReads: 0,
    firestoreWrites: 0,
    anthropic: 0,
    articleFetches: 0,
    primarySourceFetches: 0,
    workflowBindingCalls: 0,
    newsTracker: 0,
    webflow: 0,
    otherExternal: 0,
    softLimit: CANDIDATE_REQUEST_SOFT_LIMIT,
    finalisationReserve: CANDIDATE_FINALISATION_RESERVE,
    stoppedEarly: false,
  };
}

function addExternalUsage(target, increment = {}) {
  const out = target || createEmptyExternalRequestUsage();
  for (const key of Object.keys(createEmptyExternalRequestUsage())) {
    if (typeof out[key] === 'number') out[key] += Number(increment[key] || 0);
  }
  out.stoppedEarly = !!(out.stoppedEarly || increment.stoppedEarly);
  return out;
}

function classifyExternalRequest(url, init = {}) {
  const href = String(url || '');
  const method = String(init.method || 'GET').toUpperCase();
  if (href.includes('oauth2.googleapis.com')) return 'firebaseAuth';
  if (href.includes('firestore.googleapis.com')) return method === 'GET' || href.includes(':runQuery') ? 'firestoreReads' : 'firestoreWrites';
  if (href.includes('api.anthropic.com')) return 'anthropic';
  if (href.includes('api.webflow.com')) return 'webflow';
  if (href.includes('script.google.com') || href.includes('tracker')) return 'newsTracker';
  return 'otherExternal';
}

function budgetedFetch(fetchImpl, usage, options = {}) {
  return async (url, init = {}) => {
    const category = options.category || classifyExternalRequest(url, init);
    const reserve = Number(usage.finalisationReserve || CANDIDATE_FINALISATION_RESERVE);
    const softLimit = Number(usage.softLimit || CANDIDATE_REQUEST_SOFT_LIMIT);
    if (usage.totalExternalFetches >= Math.max(0, softLimit - reserve)) {
      usage.stoppedEarly = true;
      const err = new Error('candidate_request_budget_reached');
      err.failureCode = 'candidate_request_budget_reached';
      err.failureStage = options.stage || 'unknown';
      throw err;
    }
    usage.totalExternalFetches += 1;
    if (category === 'firebaseAuth') usage.firebaseAuth += 1;
    else if (category === 'firestoreReads') usage.firestoreReads += 1;
    else if (category === 'firestoreWrites') usage.firestoreWrites += 1;
    else if (category === 'anthropic') usage.anthropic += 1;
    else if (category === 'articleFetch') usage.articleFetches += 1;
    else if (category === 'primarySourceFetch') usage.primarySourceFetches += 1;
    else if (category === 'workflowBinding') usage.workflowBindingCalls += 1;
    else if (category === 'newsTracker') usage.newsTracker += 1;
    else if (category === 'webflow') usage.webflow += 1;
    else usage.otherExternal += 1;
    return fetchImpl(url, init);
  };
}

function workflowInstanceIdForRun(runId) {
  return safeRunId(runId) ? runId.slice(0, 100) : '';
}

function normalizeWorkflowState(value) {
  const raw = typeof value === 'object' && value ? (value.status || value.state || value.workflowState || value.name) : value;
  const state = String(raw || '').toLowerCase();
  if (['running', 'paused', 'waiting'].includes(state)) return 'running';
  if (['queued'].includes(state)) return 'queued';
  if (['retrying'].includes(state)) return 'retrying';
  if (['complete', 'completed', 'success', 'succeeded'].includes(state)) return 'completed';
  if (['failed', 'failure', 'errored', 'terminated'].includes(state)) return 'failed';
  return WORKFLOW_STATES.includes(state) ? state : '';
}

async function getWorkflowInstanceState(env, workflowInstanceId) {
  if (!workflowInstanceId || !env?.[NEWS_BRIEF_WORKFLOW_BINDING]?.get) return '';
  try {
    const instance = await env[NEWS_BRIEF_WORKFLOW_BINDING].get(workflowInstanceId);
    if (!instance?.status) return '';
    return normalizeWorkflowState(await instance.status());
  } catch {
    return '';
  }
}

async function reconcileWorkflowRunState(env, store, run, dryRun = true) {
  if (!run?.workflowInstanceId && !run?.coordinatorWorkflowInstanceId) return run;
  const workflowState = await getWorkflowInstanceState(env, run.coordinatorWorkflowInstanceId || run.workflowInstanceId);
  if (!workflowState || workflowState === run.workflowState && (!run.coordinatorWorkflowInstanceId || workflowState === run.coordinatorWorkflowState)) return run;
  const now = new Date().toISOString();
  const patch = {
    ...run,
    coordinatorWorkflowState: workflowState,
    workflowState,
    updatedAt: now,
  };
  const appState = logicalRunState(run);
  if (workflowState === 'completed' && ['preparing', 'running'].includes(appState)) {
    if (Array.isArray(run.selectedCandidates) || Array.isArray(run.candidateWorkflowIds)) {
      patch.orchestrationState = 'fanout_completed';
      patch.applicationState = appState === 'preparing' ? 'running' : appState;
      patch.state = patch.applicationState;
      patch.percentComplete = progressPercent(Number(run.completedItems || 0), Number(run.targetItems || 0)) ?? run.percentComplete ?? null;
      patch.activeRun = true;
    } else if (Number(run.targetItems || 0) > Number(run.completedItems || 0)) {
      patch.applicationState = 'failed';
      patch.state = 'failed';
      patch.percentComplete = progressPercent(Number(run.completedItems || 0), Number(run.targetItems || 0));
      patch.endTime = run.endTime || now;
      patch.activeRun = false;
      patch.failureCode = run.failureCode || 'workflow_ended_before_pipeline_completion';
      patch.failureStage = run.failureStage || run.phase || 'unknown';
      patch.failureMessage = run.failureMessage || 'Cloudflare Workflow completed before the News Brief pipeline reached all selected candidates.';
    } else {
      patch.applicationState = run.failures ? 'completed_with_failures' : 'completed';
      patch.state = patch.applicationState;
      patch.phase = 'completed';
      patch.percentComplete = Number(run.targetItems || 0) === 0 ? 100 : progressPercent(run.completedItems, run.targetItems);
      patch.endTime = run.endTime || now;
      patch.activeRun = false;
    }
  } else if (workflowState === 'failed' && ['preparing', 'running'].includes(run.state)) {
    const failureStage = staleFailureStage(run);
    const target = run.targetItems === null || run.targetItems === undefined ? null : run.targetItems;
    patch.state = 'failed';
    patch.applicationState = 'failed';
    patch.orchestrationState = run.orchestrationState || 'failed';
    patch.percentComplete = target ? progressPercent(Number(run.completedItems || 0), target) : run.percentComplete ?? null;
    patch.endTime = run.endTime || now;
    patch.activeRun = false;
    patch.failureStage = run.failureStage && run.failureStage !== 'unknown' ? run.failureStage : failureStage;
    patch.failureCode = run.failureCode || 'workflow_failed';
    patch.failureMessage = run.failureMessage || 'Cloudflare Workflow reported a failed terminal state.';
    patch.errorSummary = [
      ...(Array.isArray(run.errorSummary) ? run.errorSummary : []),
      { run: patch.failureMessage, failureStage: patch.failureStage, failureCode: patch.failureCode },
    ];
  }
  if (store?.saveRun) await store.saveRun(patch, { dryRun });
  return patch;
}

function createInitialRunSummary(runId, options, config, workflowInstanceId = '') {
  const now = new Date().toISOString();
  return {
    runId,
    triggerType: options.triggerType || 'manual',
    coordinatorWorkflowInstanceId: workflowInstanceId,
    coordinatorWorkflowState: workflowInstanceId ? 'queued' : '',
    orchestrationState: workflowInstanceId ? 'queued' : '',
    applicationState: 'preparing',
    workflowInstanceId,
    workflowState: workflowInstanceId ? 'queued' : '',
    workflowCreatedAt: workflowInstanceId ? now : '',
    currentWorkflowStep: 'initialise-run',
    state: 'preparing',
    phase: 'fetching_tracker',
    startTime: now,
    updatedAt: now,
    heartbeatAt: now,
    itemsReceived: 0,
    itemsSkipped: 0,
    targetItems: null,
    completedItems: 0,
    currentItemIndex: 0,
    currentCandidateId: '',
    currentHeadline: '',
    percentComplete: null,
    itemsRejected: 0,
    itemsNeedingEditorialCheck: 0,
    itemsVerified: 0,
    draftsGenerated: 0,
    emailsSent: 0,
    failures: 0,
    dryRun: options.dryRun !== undefined ? !!options.dryRun : config.dryRun,
    errorSummary: [],
    attemptedItems: [],
    preflightSkippedItems: [],
    anthropicCallLog: [],
    currentAnthropicCallId: '',
    currentAnthropicStage: '',
    currentAnthropicCandidateId: '',
    lastCompletedAnthropicCallId: '',
    usage: createEmptyUsage(),
    externalRequestUsage: createEmptyExternalRequestUsage(),
    selectedCandidates: [],
    candidateWorkflowIds: [],
    childWorkflowSummaries: [],
    itemsAlreadyPublishedOnWocult: 0,
    itemsAlreadyInWebflowDraft: 0,
    itemsPossibleWocultDuplicates: 0,
    itemsSkippedBeforeClaude: 0,
    candidatesEligibleForClaude: 0,
    webflowItemsChecked: 0,
    wocultDuplicateCheckCompleted: false,
    wocultDuplicateCheckAt: '',
    wocultDuplicateCheckError: '',
    activeRun: true,
  };
}

async function recoverStaleRun(store, run, dryRun = true) {
  if (!activeRunIsStale(run)) return run;
  const now = new Date().toISOString();
  const target = run.targetItems === null || run.targetItems === undefined ? null : run.targetItems;
  const completed = Number(run.completedItems || 0);
  const failureMessage = staleRunMessage({ ...run, targetItems: target });
  const start = Date.parse(run.startTime || '');
  const failureStage = staleFailureStage(run);
  const recovered = {
    ...run,
    state: 'failed',
    phase: run.phase || 'unknown',
    targetItems: target,
    completedItems: completed,
    percentComplete: target ? progressPercent(completed, target) : run.percentComplete ?? null,
    endTime: now,
    updatedAt: now,
    heartbeatAt: now,
    duration: Number.isFinite(start) ? Math.max(0, Date.parse(now) - start) : run.duration,
    activeRun: false,
    failureStage,
    failureCode: run.failureCode || 'stale_run_timeout',
    failureMessage,
    errorSummary: [
      ...(Array.isArray(run.errorSummary) ? run.errorSummary : []),
      { run: failureMessage, failureStage, failureCode: run.failureCode || 'stale_run_timeout' },
    ],
  };
  if (store.saveRun) await store.saveRun(recovered, { dryRun }).catch(() => {});
  return recovered;
}

function safeRunId(value) {
  return RUN_ID_PATTERN.test(String(value || '')) ? String(value) : '';
}

function createFailureMetadata(error, stage, runId) {
  const message = safeShortText(error?.message || String(error || 'Unknown processing error'), 1000);
  const failureStage = normalizeFailureStage(error?.failureStage || stage);
  return {
    failureStage,
    failureCode: error?.failureCode || failureCodeForError(error, failureStage),
    failureMessage: message,
    failureAt: new Date().toISOString(),
    failureRunId: runId,
    retryable: retryableFailure(failureStage, error?.failureCode),
    lastSuccessfulStage: error?.lastSuccessfulStage || lastSuccessfulStageBefore(failureStage),
    lastSuccessfulAt: new Date().toISOString(),
  };
}

function normalizeFailureStage(stage) {
  const allowed = new Set(['wocult_duplicate_check', 'spawn_candidate_workflow', 'qualification', 'primary_source_discovery', 'primary_source_fetch', 'primary_source_verification', 'source_fetch', 'verification', 'verification_parse', 'drafting', 'drafting_parse', 'firestore_write', 'webflow', 'unknown']);
  return allowed.has(stage) ? stage : stage === 'drafting_failed' ? 'drafting_parse' : stage === 'qualification_failed' ? 'qualification' : 'unknown';
}

function failureCodeForError(error, stage) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('rate')) return 'anthropic_rate_limited';
  if (message.includes('timeout')) return stage.includes('source') ? 'source_timeout' : 'anthropic_timeout';
  if (stage === 'qualification') return 'qualification_json_invalid';
  if (stage === 'drafting_parse') return 'drafting_json_invalid';
  if (stage === 'verification_parse') return 'verification_json_invalid';
  if (stage === 'firestore_write') return 'firestore_write_failed';
  if (stage === 'wocult_duplicate_check') return error?.failureCode || 'webflow_news_duplicate_index_failed';
  if (stage === 'spawn_candidate_workflow') return error?.failureCode || 'candidate_workflow_create_failed';
  if (stage === 'primary_source_discovery') return error?.failureCode || 'primary_source_verification_failed';
  if (message.includes('anthropic')) return 'anthropic_api_error';
  return 'unknown_processing_error';
}

function retryableFailure(stage, code) {
  return /timeout|rate_limited|unreachable|api_error|firestore/.test(`${stage} ${code || ''}`);
}

function lastSuccessfulStageBefore(stage) {
  if (stage === 'wocult_duplicate_check') return 'sorting_items';
  if (stage === 'spawn_candidate_workflow') return 'selecting_candidates';
  if (['primary_source_discovery', 'primary_source_fetch', 'primary_source_verification'].includes(stage)) return 'qualification';
  if (['verification', 'verification_parse', 'source_fetch'].includes(stage)) return 'primary_source_discovery';
  if (['drafting', 'drafting_parse'].includes(stage)) return 'verification';
  return '';
}

export function normalizeDuplicateUrl(url = '') {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
    u.pathname = u.pathname
      .replace(/\/amp\/?$/i, '')
      .replace(/\/amp(?=\/)/i, '')
      .replace(/\/+$/g, '');
    const tracking = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid']);
    const params = [...u.searchParams.entries()].filter(([key]) => !tracking.has(key.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [key, value] of params) u.searchParams.append(key, value);
    return u.toString().replace(/\/$/g, '');
  } catch {
    return '';
  }
}

function normalizeHeadlineText(value = '') {
  return String(value || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%₹$.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headlineFromSlug(slug = '') {
  return normalizeHeadlineText(String(slug || '').replace(/-/g, ' '));
}

function tokenSet(value = '') {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under', 'after', 'before', 'news', 'india', 'indian', 'workers', 'workforce', 'employees']);
  return new Set(normalizeHeadlineText(value).split(/\s+/).filter((t) => t.length > 2 && !stop.has(t)));
}

function jaccard(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((t) => right.has(t)).length;
  return intersection / new Set([...left, ...right]).size;
}

function factSignalsFromText(...parts) {
  const text = parts.filter(Boolean).join(' ');
  const signals = new Set();
  for (const m of text.matchAll(/\b(?:\d+(?:\.\d+)?%|₹\s?\d+(?:\.\d+)?\s?(?:crore|lakh|million|billion)?|\$\s?\d+(?:\.\d+)?\s?(?:million|billion)?|\d{4}|\d+(?:,\d{3})+|\d+(?:\.\d+)?)\b/gi)) signals.add(m[0].toLowerCase().replace(/\s+/g, ''));
  for (const m of text.matchAll(/\b[A-Z][A-Za-z&.-]*(?:\s+[A-Z][A-Za-z&.-]*){0,4}\b/g)) {
    const phrase = m[0].trim();
    if (phrase.length > 3) signals.add(phrase.toLowerCase());
  }
  for (const m of text.matchAll(/\b[A-Z]{2,}\b/g)) signals.add(m[0].toLowerCase());
  return [...signals].slice(0, 40);
}

function itemFieldData(item = {}) {
  return item.fieldData || item.fieldDataDraft || item.fields || item || {};
}

function webflowItemState(item = {}) {
  return item.isDraft || item.draft ? 'draft' : 'published';
}

function wocultUrlForItem(item = {}, fields = {}) {
  const slug = fields.slug || item.slug || '';
  return slug ? `https://www.wocult.com/news/${slug}` : '';
}

function primaryUrlsFromFields(fields = {}) {
  return [
    fields['primary-source-url'],
    fields.primarySourceUrl,
    fields['primary-source-urls'],
    fields.primarySourceUrls,
  ].flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[\s,]+/)).filter(isUsableUrl);
}

export function buildWocultDuplicateIndex(items = []) {
  return items.filter((item) => !item.isArchived).map((item) => {
    const fields = itemFieldData(item);
    const headline = clean(fields.name || fields.title || item.name || '');
    const slug = clean(fields.slug || item.slug || '');
    const articleSourceUrl = clean(fields['source-url'] || fields.sourceUrl || fields.url || '');
    const primarySourceUrls = primaryUrlsFromFields(fields);
    const normalisedHeadline = normalizeHeadlineText(headline);
    return stripEmptyOptionalFields({
      webflowItemId: item.id || item._id || '',
      headline,
      slug,
      wocultUrl: wocultUrlForItem(item, fields),
      isDraft: !!(item.isDraft || item.draft),
      lastPublished: item.lastPublished || item.publishedOn || '',
      lastUpdated: item.lastUpdated || item.updatedOn || item.updatedAt || '',
      articleSourceUrl,
      primarySourceUrls,
      normalisedArticleSourceUrl: normalizeDuplicateUrl(articleSourceUrl),
      normalisedPrimarySourceUrls: primarySourceUrls.map(normalizeDuplicateUrl).filter(Boolean),
      normalisedHeadline,
      headlineFingerprint: stableHash(normalisedHeadline),
      slugHeadline: headlineFromSlug(slug),
      factSignals: factSignalsFromText(headline, fields.standfirst, fields['seo-description'], fields.body),
    });
  });
}

function candidatePrimaryUrls(item = {}) {
  return [item.primarySourceUrl, item.primarySourceUrls, item.supportingSourceUrls]
    .flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[\s,]+/))
    .filter(isUsableUrl);
}

function duplicateResultFor(item, match, status, confidence, matchReason, signals = []) {
  return {
    checked: true,
    checkedAt: new Date().toISOString(),
    status,
    confidence,
    matchReason,
    matchedWebflowItemId: match?.webflowItemId || '',
    matchedWocultHeadline: match?.headline || '',
    matchedWocultUrl: match?.wocultUrl || '',
    matchedItemState: match?.isDraft ? 'draft' : match ? 'published' : '',
    signals,
    anthropicCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    webSearchRequests: 0,
  };
}

export function checkWocultDuplicate(item = {}, index = []) {
  const sourceUrl = normalizeDuplicateUrl(item.sourceUrl || item.link || item.url || '');
  if (sourceUrl) {
    const exact = index.find((entry) => entry.normalisedArticleSourceUrl && entry.normalisedArticleSourceUrl === sourceUrl);
    if (exact) return duplicateResultFor(item, exact, exact.isDraft ? 'already_in_webflow_draft' : 'already_published_on_wocult', 'exact', 'article_source_url_exact', ['article_source_url']);
  }
  const primaryUrls = candidatePrimaryUrls(item).map(normalizeDuplicateUrl).filter(Boolean);
  for (const url of primaryUrls) {
    const exact = index.find((entry) => (entry.normalisedPrimarySourceUrls || []).includes(url));
    if (exact) return duplicateResultFor(item, exact, exact.isDraft ? 'already_in_webflow_draft' : 'already_published_on_wocult', 'exact', 'primary_source_url_exact', ['primary_source_url']);
  }
  const headline = normalizeHeadlineText(item.headline || item.title || '');
  if (headline) {
    const exactHeadline = index.find((entry) => entry.normalisedHeadline && entry.normalisedHeadline === headline);
    if (exactHeadline) return duplicateResultFor(item, exactHeadline, exactHeadline.isDraft ? 'already_in_webflow_draft' : 'already_published_on_wocult', 'exact', 'headline_exact', ['headline']);
    const exactSlug = index.find((entry) => entry.slugHeadline && entry.slugHeadline === headline);
    if (exactSlug) return duplicateResultFor(item, exactSlug, exactSlug.isDraft ? 'already_in_webflow_draft' : 'already_published_on_wocult', 'exact', 'slug_exact', ['slug']);
  }
  const candidateSignals = factSignalsFromText(item.headline, item.whyItMatters, item.verification);
  let best = null;
  for (const entry of index) {
    const headlineSimilarity = Math.max(jaccard(headline, entry.normalisedHeadline), jaccard(headline, entry.slugHeadline));
    const sharedSignals = candidateSignals.filter((s) => (entry.factSignals || []).includes(s));
    const strongSignals = sharedSignals.filter((s) => /[%₹$\d]|[a-z]{4,}\s+[a-z]{4,}/i.test(s));
    const independentSignals = (headlineSimilarity >= WOCULT_HEADLINE_HIGH_THRESHOLD ? 1 : 0) + (strongSignals.length ? 1 : 0);
    const score = headlineSimilarity + Math.min(0.4, strongSignals.length * 0.08);
    if (!best || score > best.score) best = { entry, headlineSimilarity, sharedSignals: strongSignals, independentSignals, score };
  }
  if (best?.independentSignals >= 2 && best.headlineSimilarity >= WOCULT_HEADLINE_HIGH_THRESHOLD) {
    return duplicateResultFor(item, best.entry, best.entry.isDraft ? 'already_in_webflow_draft' : 'already_published_on_wocult', 'high', 'story_fingerprint_high', best.sharedSignals);
  }
  if (best && best.headlineSimilarity >= WOCULT_HEADLINE_POSSIBLE_THRESHOLD && best.sharedSignals.length) {
    return duplicateResultFor(item, best.entry, 'possible_wocult_duplicate', 'possible', 'story_fingerprint_possible', best.sharedSignals);
  }
  return duplicateResultFor(item, null, 'no_wocult_match', 'none', 'none', []);
}

export async function fetchWebflowNewsArchive(env, deps = {}) {
  if (deps.fetchWebflowNewsArchive) return deps.fetchWebflowNewsArchive(env);
  const fetchImpl = deps.fetch || fetch;
  const token = env.WEBFLOW_API_TOKEN || env.WEBFLOW_TOKEN || '';
  if (!token) {
    const err = new Error('The Wocult archive could not be checked. Candidate assessment was not started.');
    err.failureStage = 'wocult_duplicate_check';
    err.failureCode = 'webflow_news_collection_unavailable';
    throw err;
  }
  const collectionId = env.WEBFLOW_NEWS_COLLECTION_ID || WEBFLOW_NEWS_COLLECTION_ID;
  const items = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const res = await fetchWithTimeout(`https://api.webflow.com/v2/collections/${collectionId}/items?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    }, 20000, fetchImpl);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error('The Wocult archive could not be checked. Candidate assessment was not started.');
      err.failureStage = 'wocult_duplicate_check';
      err.failureCode = 'webflow_news_fetch_failed';
      throw err;
    }
    const pageItems = Array.isArray(data.items) ? data.items : [];
    items.push(...pageItems);
    const total = Number(data.pagination?.total || data.total || items.length);
    if (pageItems.length < 100 || items.length >= total) break;
  }
  return items;
}

function preflightSkippedItemFrom(item, duplicateCheck) {
  return stripEmptyOptionalFields({
    candidateId: `nt_${createStoryFingerprint(item)}`,
    headline: item.headline,
    source: item.source,
    sourceUrl: item.sourceUrl,
    dateFound: item.dateFound,
    duplicateStatus: duplicateCheck.status,
    duplicateConfidence: duplicateCheck.confidence,
    matchReason: duplicateCheck.matchReason,
    matchedWebflowItemId: duplicateCheck.matchedWebflowItemId,
    matchedWocultHeadline: duplicateCheck.matchedWocultHeadline,
    matchedWocultUrl: duplicateCheck.matchedWocultUrl,
    matchedItemState: duplicateCheck.matchedItemState,
  });
}

function attemptedItemFrom(item, candidate, usage, outcome, failure = null) {
  return stripEmptyOptionalFields({
    candidateId: candidate?.candidateId || `nt_${createStoryFingerprint(item)}`,
    headline: item.headline,
    source: item.source,
    sourceUrl: item.sourceUrl,
    dateFound: item.dateFound,
    processedAt: new Date().toISOString(),
    status: candidate?.status || outcome,
    outcome,
    primarySourceDiscoveryStatus: candidate?.primarySourceDiscoveryStatus || '',
    failureStage: failure?.failureStage || '',
    failureCode: failure?.failureCode || '',
    failureMessage: safeShortText(failure?.failureMessage || '', 1000),
    usage,
  });
}

function compactTrackerCandidate(item, candidateIndex) {
  const fingerprint = createStoryFingerprint(item);
  return stripEmptyOptionalFields({
    candidateId: `nt_${fingerprint}`,
    candidateIndex,
    headline: item.headline,
    sourceName: item.source,
    source: item.source,
    sourceUrl: item.sourceUrl,
    dateFound: item.dateFound,
    publicationDate: item.publicationDate,
    category: item.theme,
    theme: item.theme,
    priority: item.priority,
    suggestedFormat: item.suggestedFormat,
    whyItMatters: item.whyItMatters,
    verification: item.verification,
    status: item.status,
    owner: item.owner,
    publishedLink: item.publishedLink,
    imageUrl: item.imageUrl,
    primarySourceUrl: item.primarySourceUrl,
    primarySourceUrls: item.primarySourceUrls || [],
    emailSubject: item.emailSubject,
    parsedFrom: item.parsedFrom,
    trackerFingerprint: fingerprint,
    sourceId: item.sourceId,
    rowIndex: item.rowIndex,
  });
}

function itemFromCompactCandidate(candidate = {}) {
  return normalizeNewsTrackerItem({
    id: candidate.sourceId || candidate.candidateId,
    dateFound: candidate.dateFound,
    source: candidate.sourceName || candidate.source,
    headline: candidate.headline,
    link: candidate.sourceUrl,
    publicationDate: candidate.publicationDate,
    theme: candidate.theme || candidate.category,
    priority: candidate.priority,
    suggestedFormat: candidate.suggestedFormat,
    whyItMatters: candidate.whyItMatters,
    verification: candidate.verification,
    status: candidate.status,
    owner: candidate.owner,
    publishedLink: candidate.publishedLink,
    imageUrl: candidate.imageUrl,
    primarySourceUrl: candidate.primarySourceUrl,
    primarySourceUrls: candidate.primarySourceUrls,
    emailSubject: candidate.emailSubject,
    parsedFrom: candidate.parsedFrom,
  }, candidate.rowIndex || 0);
}

function candidateWorkflowInstanceId(runId, candidate) {
  const shortRun = stableHash(runId).slice(0, 12);
  const hash = stableHash(candidate.candidateId || candidate.headline || '').slice(0, 12);
  return `nbc-${shortRun}-${candidate.candidateIndex || 0}-${hash}`.slice(0, 96);
}

function finalizerWorkflowInstanceId(runId, candidateId) {
  return `nbf-${stableHash(runId).slice(0, 12)}-${stableHash(candidateId || 'run').slice(0, 16)}`.slice(0, 96);
}

function coordinatorWorkflowInstanceIdForRun(runId) {
  return workflowInstanceIdForRun(runId);
}

async function workflowStep(deps, name, configName, fn) {
  const stepConfig = NEWS_BRIEF_WORKFLOW_STEP_CONFIG[configName] || NEWS_BRIEF_WORKFLOW_STEP_CONFIG.default;
  if (deps.workflowStep?.do) return deps.workflowStep.do(name, stepConfig, async (ctx) => fn(ctx || { attempt: 1, step: { name, count: 1 }, config: stepConfig }));
  return fn({ attempt: 1, step: { name, count: 1 }, config: stepConfig });
}

async function existingFingerprintSet(store, items) {
  const fingerprints = [...new Set(items.map(createStoryFingerprint))];
  if (store.existingFingerprints) return new Set(await store.existingFingerprints(fingerprints));
  const out = new Set();
  for (const fingerprint of fingerprints.slice(0, 30)) {
    if (await store.existsByFingerprint(fingerprint)) out.add(fingerprint);
  }
  return out;
}

async function suppressedClusterSet(store, items) {
  const clusters = [...new Set(items.map(clusterKey))];
  if (store.suppressedClusterKeys) return new Set(await store.suppressedClusterKeys(clusters));
  const out = new Set();
  for (const cKey of clusters.slice(0, 30)) {
    if (await store.isDeclinedSuppressed(cKey)) out.add(cKey);
  }
  return out;
}

function selectedPayloadSizeBytes(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function childDisplayFallbacks(run = {}) {
  const selected = new Map((run.selectedCandidates || []).map((candidate) => [candidate.candidateId, candidate]));
  const workflows = new Map((run.candidateWorkflowIds || []).map((entry) => [entry.candidateId, entry]));
  return { selected, workflows };
}

function childSummaryFromRecord(child = {}, fallback = {}) {
  const selected = fallback.selected?.get(child.candidateId) || {};
  const workflow = fallback.workflows?.get(child.candidateId) || {};
  return stripEmptyOptionalFields({
    candidateId: child.candidateId || selected.candidateId || workflow.candidateId,
    candidateIndex: child.candidateIndex || selected.candidateIndex || workflow.candidateIndex,
    headline: child.headline || selected.headline || workflow.headline,
    workflowInstanceId: child.workflowInstanceId || workflow.workflowInstanceId,
    workflowState: child.workflowState || workflow.workflowState,
    applicationState: child.applicationState || workflow.applicationState,
    currentStage: child.currentStage || workflow.currentStage,
    finalStatus: child.finalStatus || workflow.finalStatus,
    finalised: child.finalised === true,
    usage: child.usage || createEmptyUsage(),
    externalRequestUsage: child.externalRequestUsage || createEmptyExternalRequestUsage(),
    failureStage: child.failureStage || workflow.failureStage,
    failureCode: child.failureCode || workflow.failureCode,
    failureMessage: child.failureMessage || workflow.failureMessage,
    updatedAt: child.updatedAt || workflow.updatedAt,
  });
}

function childRecordsWithParentFallbacks(run = {}, children = []) {
  const byId = new Map(children.map((child) => [child.candidateId, child]));
  for (const candidate of run.selectedCandidates || []) {
    if (!candidate?.candidateId || byId.has(candidate.candidateId)) continue;
    byId.set(candidate.candidateId, {
      candidateId: candidate.candidateId,
      candidateIndex: candidate.candidateIndex,
      headline: candidate.headline,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.sourceUrl,
      dateFound: candidate.dateFound,
      workflowState: 'unknown',
      applicationState: 'queued',
      currentStage: 'queued',
      finalStatus: 'pending',
      finalised: false,
    });
  }
  for (const workflow of run.candidateWorkflowIds || []) {
    if (!workflow?.candidateId) continue;
    byId.set(workflow.candidateId, { ...(byId.get(workflow.candidateId) || {}), ...workflow });
  }
  return [...byId.values()].sort((a, b) => Number(a.candidateIndex || 0) - Number(b.candidateIndex || 0));
}

export async function runNewsBriefCoordinatorWorkflow(env, options = {}, deps = {}) {
  const config = getAutomationConfig(env);
  const dryRun = options.dryRun !== undefined ? !!options.dryRun : config.dryRun;
  const runId = options.requestRunId || '';
  if (!safeRunId(runId)) return { ok: false, status: 400, error: 'invalid_requestRunId' };
  const store = getStore(env, deps);
  const now = () => new Date().toISOString();
  let summary = await store.getRun?.(runId);
  if (!summary) summary = createInitialRunSummary(runId, { ...options, dryRun }, config, options.coordinatorWorkflowInstanceId || coordinatorWorkflowInstanceIdForRun(runId));
  const saveRunCritical = async (patch = {}) => {
    summary = { ...summary, ...patch, updatedAt: now(), heartbeatAt: patch.phase || patch.state || patch.applicationState ? now() : (summary.heartbeatAt || now()) };
    await store.saveRun(summary, { dryRun });
  };
  try {
    await workflowStep(deps, 'initialise-run', 'noRetry', async () => saveRunCritical({
      coordinatorWorkflowState: 'running',
      workflowState: 'running',
      orchestrationState: 'selecting_candidates',
      applicationState: 'preparing',
      state: 'preparing',
      phase: 'fetching_tracker',
      activeRun: true,
    }));
    const trackerInfo = await workflowStep(deps, 'fetch-news-tracker', 'default', async () => {
      const tracker = await fetchNewsTracker(config, deps);
      return { items: tracker.items.map((item, index) => compactTrackerCandidate(item, index + 1)), itemsReceived: tracker.items.length };
    });
    const trackerItems = (trackerInfo.items || []).map(itemFromCompactCandidate);
    await saveRunCritical({ itemsReceived: trackerInfo.itemsReceived || trackerItems.length, phase: 'checking_wocult_archive' });
    const webflowIndex = await workflowStep(deps, 'fetch-and-index-webflow-news-archive', 'default', async () => {
      const webflowItems = await fetchWebflowNewsArchive(env, deps);
      return buildWocultDuplicateIndex(webflowItems);
    });
    await saveRunCritical({
      webflowItemsChecked: webflowIndex.length,
      wocultDuplicateCheckCompleted: true,
      wocultDuplicateCheckAt: now(),
      wocultDuplicateCheckError: '',
      phase: 'selecting_candidates',
    });
    const selection = await workflowStep(deps, 'select-candidates', 'default', async () => {
      const scanWindow = trackerItems.slice(0, Math.max(config.maxItemsPerRun * 12, config.maxItemsPerRun));
      const existing = await existingFingerprintSet(store, scanWindow);
      const suppressed = await suppressedClusterSet(store, scanWindow);
      const selectedCandidates = [];
      const preflightSkippedItems = [];
      const seenClusters = new Set();
      const duplicateCounts = { itemsSkipped: 0, itemsSkippedBeforeClaude: 0, itemsAlreadyPublishedOnWocult: 0, itemsAlreadyInWebflowDraft: 0, itemsPossibleWocultDuplicates: 0 };
      for (const item of scanWindow) {
        if (selectedCandidates.length >= config.maxItemsPerRun) break;
        const fingerprint = createStoryFingerprint(item);
        const cKey = clusterKey(item);
        if (seenClusters.has(cKey) || existing.has(fingerprint) || suppressed.has(cKey)) {
          duplicateCounts.itemsSkipped += 1;
          continue;
        }
        const duplicateCheck = checkWocultDuplicate(item, webflowIndex);
        if (duplicateCheck.status !== 'no_wocult_match') {
          const duplicateCandidate = withCandidateMetadata({
            ...candidateFromTrackerItem(item),
            candidateId: `nt_${fingerprint}`,
            status: duplicateCheck.status === 'possible_wocult_duplicate' ? 'needs_editorial_check' : duplicateCheck.status,
            dryRun,
            duplicateCheck,
            usage: createEmptyUsage(),
          }, null, { runId });
          await store.saveCandidate(duplicateCandidate, { dryRun, runId });
          duplicateCounts.itemsSkippedBeforeClaude += 1;
          if (duplicateCheck.status === 'already_published_on_wocult') duplicateCounts.itemsAlreadyPublishedOnWocult += 1;
          if (duplicateCheck.status === 'already_in_webflow_draft') duplicateCounts.itemsAlreadyInWebflowDraft += 1;
          if (duplicateCheck.status === 'possible_wocult_duplicate') duplicateCounts.itemsPossibleWocultDuplicates += 1;
          preflightSkippedItems.push(preflightSkippedItemFrom(item, duplicateCheck));
          continue;
        }
        seenClusters.add(cKey);
        selectedCandidates.push(compactTrackerCandidate(item, selectedCandidates.length + 1));
      }
      return {
        selectedCandidates,
        preflightSkippedItems,
        itemsReceived: trackerItems.length,
        webflowItemsChecked: webflowIndex.length,
        duplicateCounts,
      };
    });
    if (selectedPayloadSizeBytes(selection) > COORDINATOR_OUTPUT_SOFT_LIMIT_BYTES) throw Object.assign(new Error('Coordinator selection payload exceeded safe size'), { failureCode: 'workflow_payload_too_large', failureStage: 'selecting_candidates' });
    const targetItems = selection.selectedCandidates.length;
    await saveRunCritical({
      selectedCandidates: selection.selectedCandidates,
      preflightSkippedItems: selection.preflightSkippedItems,
      itemsSkipped: selection.duplicateCounts.itemsSkipped,
      itemsSkippedBeforeClaude: selection.duplicateCounts.itemsSkippedBeforeClaude,
      itemsAlreadyPublishedOnWocult: selection.duplicateCounts.itemsAlreadyPublishedOnWocult,
      itemsAlreadyInWebflowDraft: selection.duplicateCounts.itemsAlreadyInWebflowDraft,
      itemsPossibleWocultDuplicates: selection.duplicateCounts.itemsPossibleWocultDuplicates,
      candidatesEligibleForClaude: targetItems,
      targetItems,
      completedItems: 0,
      percentComplete: targetItems ? 0 : 100,
      applicationState: targetItems ? 'running' : 'completed',
      state: targetItems ? 'running' : 'completed',
      activeRun: targetItems > 0,
      phase: targetItems ? 'selecting_candidates' : 'completed',
      orchestrationState: targetItems ? 'spawning_candidates' : 'fanout_completed',
      endTime: targetItems ? '' : now(),
      reason: targetItems ? '' : 'no eligible unprocessed candidates',
    });
    const childIds = [];
    for (const candidate of selection.selectedCandidates) {
      const instanceId = candidateWorkflowInstanceId(runId, candidate);
      childIds.push({
        candidateId: candidate.candidateId,
        candidateIndex: candidate.candidateIndex,
        headline: candidate.headline,
        workflowInstanceId: instanceId,
        workflowState: 'queued',
        applicationState: 'queued',
        currentStage: 'queued',
        finalStatus: 'pending',
        finalised: false,
      });
      await workflowStep(deps, `spawn-candidate-${candidate.candidateIndex}`, 'default', async () => {
        await store.saveChildRun(runId, candidate.candidateId, {
          ...candidate,
          runId,
          workflowInstanceId: instanceId,
          workflowState: 'queued',
          applicationState: 'queued',
          currentStage: 'queued',
          finalised: false,
          usage: createEmptyUsage(),
          externalRequestUsage: createEmptyExternalRequestUsage(),
          updatedAt: now(),
        }, { dryRun });
        let workflowCreated = false;
        try {
          if (!env[NEWS_BRIEF_CANDIDATE_WORKFLOW_BINDING]?.create) throw Object.assign(new Error('candidate workflow binding unavailable'), { failureCode: 'candidate_workflow_binding_unavailable', failureStage: 'spawn_candidate_workflow' });
          await env[NEWS_BRIEF_CANDIDATE_WORKFLOW_BINDING].create({
            id: instanceId,
            params: { runId, candidate, dryRun, workflowInstanceId: instanceId },
          });
          workflowCreated = true;
        } catch (e) {
          if (/already|exist|duplicate/i.test(e.message || '')) workflowCreated = false;
          else {
            const failure = createFailureMetadata(Object.assign(e, { failureStage: 'spawn_candidate_workflow', failureCode: e.failureCode || 'candidate_workflow_create_failed' }), 'spawn_candidate_workflow', runId);
            await store.saveChildRun(runId, candidate.candidateId, {
              runId,
              candidateId: candidate.candidateId,
              candidateIndex: candidate.candidateIndex,
              headline: candidate.headline,
              sourceName: candidate.sourceName,
              sourceUrl: candidate.sourceUrl,
              dateFound: candidate.dateFound,
              workflowInstanceId: instanceId,
              workflowState: 'failed',
              applicationState: 'failed',
              currentStage: 'spawn_candidate_workflow',
              finalStatus: 'failed',
              finalised: true,
              finalisedAt: now(),
              failureStage: failure.failureStage,
              failureCode: failure.failureCode,
              failureMessage: failure.failureMessage,
              retryable: false,
              usage: createEmptyUsage(),
              externalRequestUsage: createEmptyExternalRequestUsage(),
              attemptedItem: {
                candidateId: candidate.candidateId,
                headline: candidate.headline,
                source: candidate.sourceName,
                sourceUrl: candidate.sourceUrl,
                dateFound: candidate.dateFound,
                processedAt: now(),
                status: 'failed',
                outcome: 'failed',
                failureStage: failure.failureStage,
                failureCode: failure.failureCode,
                failureMessage: failure.failureMessage,
              },
              updatedAt: now(),
            }, { dryRun });
            if (env[NEWS_BRIEF_FINALIZER_WORKFLOW_BINDING]?.create) await triggerFinalizerWorkflow(env, runId, candidate.candidateId, dryRun, store, createEmptyExternalRequestUsage());
            return { candidateId: candidate.candidateId, candidateIndex: candidate.candidateIndex, workflowInstanceId: instanceId, workflowCreated: false, headline: candidate.headline };
          }
        }
        return { candidateId: candidate.candidateId, candidateIndex: candidate.candidateIndex, workflowInstanceId: instanceId, workflowCreated, headline: candidate.headline };
      });
    }
    await saveRunCritical({
      candidateWorkflowIds: childIds,
      childWorkflowSummaries: childIds,
      coordinatorWorkflowState: 'completed',
      workflowState: 'completed',
      orchestrationState: 'fanout_completed',
      applicationState: targetItems ? 'running' : 'completed',
      state: targetItems ? 'running' : 'completed',
      activeRun: targetItems > 0,
      currentWorkflowStep: 'fanout-completed',
      phase: targetItems ? 'qualifying' : 'completed',
      percentComplete: targetItems ? 0 : 100,
    });
    return { ok: true, runId, selectedCandidates: targetItems, coordinatorCompleted: true };
  } catch (e) {
    const failure = createFailureMetadata(e, e.failureStage || summary.phase || 'unknown', runId);
    await store.saveRun({
      ...summary,
      applicationState: 'failed',
      state: 'failed',
      orchestrationState: 'failed',
      coordinatorWorkflowState: 'failed',
      workflowState: 'failed',
      activeRun: false,
      endTime: now(),
      updatedAt: now(),
      heartbeatAt: now(),
      failureStage: failure.failureStage,
      failureCode: failure.failureCode,
      failureMessage: failure.failureMessage,
      percentComplete: progressPercent(Number(summary.completedItems || 0), Number(summary.targetItems || 0)),
      errorSummary: [...(summary.errorSummary || []), { run: failure.failureMessage, failureStage: failure.failureStage, failureCode: failure.failureCode }],
    }, { dryRun });
    throw e;
  }
}

export async function runNewsBriefAutomation(env, options = {}, deps = {}) {
  const config = getAutomationConfig(env);
  const dryRun = options.dryRun !== undefined ? !!options.dryRun : config.dryRun;
  const requested = options.requestRunId || '';
  if (requested && !safeRunId(requested)) return { ok: false, status: 400, error: 'invalid_requestRunId' };
  const runId = requested || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const summary = createInitialRunSummary(runId, { ...options, dryRun }, config, options.workflowInstanceId || '');
  if (options.workflowInstanceId) summary.workflowState = 'running';
  const store = getStore(env, deps);
  const updateRun = async (patch = {}) => {
    Object.assign(summary, patch, { updatedAt: new Date().toISOString() });
    if (patch.phase || patch.state || patch.currentCandidateId !== undefined || patch.completedItems !== undefined) summary.heartbeatAt = new Date().toISOString();
    await store.saveRun(summary, { dryRun }).catch(() => {});
  };
  let currentWorkflowAttempt = 1;
  const runStep = async (name, configName, fn) => {
    const stepConfig = NEWS_BRIEF_WORKFLOW_STEP_CONFIG[configName] || NEWS_BRIEF_WORKFLOW_STEP_CONFIG.default;
    await updateRun({ currentWorkflowStep: name, workflowState: deps.workflowStep ? 'running' : summary.workflowState || '' });
    if (deps.workflowStep?.do) {
      return deps.workflowStep.do(name, stepConfig, async (ctx) => {
        currentWorkflowAttempt = Number(ctx?.attempt || ctx?.step?.count || 1);
        await updateRun({ currentWorkflowStep: name, workflowState: ctx?.attempt > 1 ? 'retrying' : 'running' });
        return fn(ctx || { attempt: 1, step: { name, count: 1 }, config: stepConfig });
      });
    }
    currentWorkflowAttempt = 1;
    return fn({ attempt: 1, step: { name, count: 1 }, config: stepConfig });
  };
  try {
    if (!config.automationEnabled && !dryRun) throw new Error('NEWS_BRIEF_AUTOMATION_ENABLED is not enabled');
    if (!options.fromWorkflow) {
      if (requested && store.getRun && await store.getRun(runId)) return { ok: false, status: 409, error: 'runId_already_exists', runId };
      let activeRun = store.activeRun ? await store.activeRun() : null;
      if (activeRunIsStale(activeRun, startedAt)) {
        activeRun = await recoverStaleRun(store, activeRun, dryRun);
      }
      if (activeRunIsRecent(activeRun, startedAt)) {
        return { ok: false, status: 409, error: 'active_run_exists', activeRunId: activeRun.runId, state: activeRun.state, phase: activeRun.phase };
      }
      await store.saveRun(summary, { dryRun, createOnly: !!requested });
    }
    await runStep('initialise-run', 'noRetry', async () => {
      await updateRun({ state: 'running', workflowState: options.workflowInstanceId ? 'running' : summary.workflowState || '', phase: 'fetching_tracker' });
      return { runId };
    });
    const tracker = await runStep('fetch-news-tracker', 'default', async () => fetchNewsTracker(config, deps));
    await updateRun({ state: 'running', phase: 'sorting_items', itemsReceived: tracker.items.length });
    await runStep('sort-tracker-items', 'noRetry', async () => ({ itemsReceived: tracker.items.length }));
    await updateRun({ phase: 'checking_wocult_archive' });
    let duplicateIndex = [];
    try {
      const webflowItems = await runStep('fetch-webflow-news-archive', 'default', async () => fetchWebflowNewsArchive(env, deps));
      duplicateIndex = await runStep('build-wocult-duplicate-index', 'noRetry', async () => buildWocultDuplicateIndex(webflowItems));
      await updateRun({
        webflowItemsChecked: duplicateIndex.length,
        wocultDuplicateCheckCompleted: true,
        wocultDuplicateCheckAt: new Date().toISOString(),
        wocultDuplicateCheckError: '',
      });
    } catch (e) {
      const failure = createFailureMetadata(e, 'wocult_duplicate_check', runId);
      summary.state = 'failed';
      summary.failures += 1;
      summary.wocultDuplicateCheckCompleted = false;
      summary.wocultDuplicateCheckAt = new Date().toISOString();
      summary.wocultDuplicateCheckError = 'The Wocult archive could not be checked. Candidate assessment was not started.';
      summary.errorSummary.push({
        run: summary.wocultDuplicateCheckError,
        failureStage: failure.failureStage,
        failureCode: failure.failureCode,
      });
      e.alreadyRecordedInRun = true;
      await updateRun({
        state: 'failed',
        failures: summary.failures,
        wocultDuplicateCheckCompleted: false,
        wocultDuplicateCheckAt: summary.wocultDuplicateCheckAt,
        wocultDuplicateCheckError: summary.wocultDuplicateCheckError,
        errorSummary: summary.errorSummary,
      });
      throw e;
    }
    const awaiting = [];
    const seenClusters = new Set();
    const selectedItems = [];

    await runStep('select-candidates', 'default', async () => {
      for (const item of tracker.items) {
        if (selectedItems.length >= config.maxItemsPerRun) break;
        const fingerprint = createStoryFingerprint(item);
        const cKey = clusterKey(item);
        if (seenClusters.has(cKey) || await store.existsByFingerprint(fingerprint) || await store.isDeclinedSuppressed(cKey)) {
          summary.itemsSkipped += 1;
          continue;
        }
        const duplicateCheck = checkWocultDuplicate(item, duplicateIndex);
        if (duplicateCheck.status !== 'no_wocult_match') {
          const duplicateCandidate = withCandidateMetadata({
            ...candidateFromTrackerItem(item),
            candidateId: `nt_${fingerprint}`,
            status: duplicateCheck.status === 'possible_wocult_duplicate' ? 'needs_editorial_check' : duplicateCheck.status,
            dryRun,
            duplicateCheck,
            rejectionReasons: [],
            qualificationResult: duplicateCheck.status === 'possible_wocult_duplicate' ? {
              qualifies: false,
              qualificationReasons: ['Possible match with an existing Wocult News story.'],
              rejectionReasons: [],
            } : {},
            usage: createEmptyUsage(),
          }, null, { runId });
          await store.saveCandidate(duplicateCandidate, { dryRun, runId });
          await store.addActivity(duplicateCandidate.candidateId, 'wocult_duplicate_check', { status: duplicateCheck.status, confidence: duplicateCheck.confidence, matchReason: duplicateCheck.matchReason }, { dryRun });
          summary.itemsSkippedBeforeClaude += 1;
          if (duplicateCheck.status === 'already_published_on_wocult') summary.itemsAlreadyPublishedOnWocult += 1;
          if (duplicateCheck.status === 'already_in_webflow_draft') summary.itemsAlreadyInWebflowDraft += 1;
          if (duplicateCheck.status === 'possible_wocult_duplicate') summary.itemsPossibleWocultDuplicates += 1;
          summary.preflightSkippedItems.push(preflightSkippedItemFrom(item, duplicateCheck));
          await updateRun({
            itemsSkippedBeforeClaude: summary.itemsSkippedBeforeClaude,
            itemsAlreadyPublishedOnWocult: summary.itemsAlreadyPublishedOnWocult,
            itemsAlreadyInWebflowDraft: summary.itemsAlreadyInWebflowDraft,
            itemsPossibleWocultDuplicates: summary.itemsPossibleWocultDuplicates,
            preflightSkippedItems: summary.preflightSkippedItems,
          });
          continue;
        }
        seenClusters.add(cKey);
        selectedItems.push(item);
      }
      return { targetItems: selectedItems.length, skippedBeforeClaude: summary.itemsSkippedBeforeClaude };
    });
    summary.candidatesEligibleForClaude = selectedItems.length;
    await updateRun({
      phase: 'selecting_candidates',
      itemsSkipped: summary.itemsSkipped,
      targetItems: selectedItems.length,
      completedItems: 0,
      percentComplete: selectedItems.length ? 0 : 100,
      candidatesEligibleForClaude: summary.candidatesEligibleForClaude,
    });

    for (let i = 0; i < selectedItems.length; i += 1) {
      const item = selectedItems[i];
      let processingStage = 'qualification';
      let qualification = null;
      let primaryDiscovery = null;
      let candidateForAttempt = null;
      const candidateUsage = createEmptyUsage();
      const candidateDeps = {
        ...deps,
        failureStage: processingStage,
        beforeAnthropicCall: async ({ model, stage }) => {
          candidateDeps.failureStage = processingStage;
          const callId = safeRandomId('anthropic');
          const startedAt = new Date().toISOString();
          const entry = stripEmptyOptionalFields({
            callId,
            candidateId: summary.currentCandidateId,
            headline: item.headline,
            stage: stage || processingStage,
            model,
            startedAt,
            completedAt: '',
            status: 'started',
            attempt: currentWorkflowAttempt,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            webSearchRequests: 0,
            durationMs: 0,
            failureCode: '',
          });
          summary.anthropicCallLog = trimAnthropicCallLog([...(summary.anthropicCallLog || []), entry], config);
          summary.currentAnthropicCallId = callId;
          summary.currentAnthropicStage = entry.stage;
          summary.currentAnthropicCandidateId = entry.candidateId;
          await updateRun({
            heartbeatAt: startedAt,
            phase: summary.phase,
            anthropicCallLog: summary.anthropicCallLog,
            currentAnthropicCallId: summary.currentAnthropicCallId,
            currentAnthropicStage: summary.currentAnthropicStage,
            currentAnthropicCandidateId: summary.currentAnthropicCandidateId,
          });
          if (deps.beforeAnthropicCall) await deps.beforeAnthropicCall({ stage: entry.stage, candidateId: summary.currentCandidateId, callId });
          return { callId };
        },
        afterAnthropicCall: async (result = {}) => {
          const callId = result.callId || summary.currentAnthropicCallId;
          const completedAt = new Date().toISOString();
          const usage = result.usage || {};
          summary.anthropicCallLog = trimAnthropicCallLog((summary.anthropicCallLog || []).map((entry) => entry.callId === callId ? {
            ...entry,
            completedAt,
            status: ['completed', 'timed_out', 'failed'].includes(result.status) ? result.status : 'failed',
            inputTokens: Number(usage.inputTokens || entry.inputTokens || 0),
            outputTokens: Number(usage.outputTokens || entry.outputTokens || 0),
            cacheCreationInputTokens: Number(usage.cacheCreationInputTokens || entry.cacheCreationInputTokens || 0),
            cacheReadInputTokens: Number(usage.cacheReadInputTokens || entry.cacheReadInputTokens || 0),
            webSearchRequests: Number(usage.webSearchRequests || entry.webSearchRequests || 0),
            durationMs: Number(result.durationMs || entry.durationMs || 0),
            failureCode: result.failureCode || entry.failureCode || '',
          } : entry), config);
          summary.lastCompletedAnthropicCallId = result.status === 'completed' ? callId : summary.lastCompletedAnthropicCallId;
          summary.currentAnthropicCallId = '';
          summary.currentAnthropicStage = '';
          summary.currentAnthropicCandidateId = '';
          await updateRun({
            heartbeatAt: completedAt,
            phase: summary.phase,
            anthropicCallLog: summary.anthropicCallLog,
            currentAnthropicCallId: '',
            currentAnthropicStage: '',
            currentAnthropicCandidateId: '',
            lastCompletedAnthropicCallId: summary.lastCompletedAnthropicCallId,
          });
          if (deps.afterAnthropicCall) await deps.afterAnthropicCall({ stage: result.stage || processingStage, candidateId: summary.currentCandidateId, callId, status: result.status });
        },
        recordAnthropicUsage: (usage) => {
          addUsage(candidateUsage, usage);
          addUsage(summary.usage, usage);
          if (deps.recordAnthropicUsage) deps.recordAnthropicUsage(usage);
        },
      };
      try {
        const fingerprint = createStoryFingerprint(item);
        await updateRun({ phase: 'qualifying', currentItemIndex: i + 1, currentCandidateId: `nt_${fingerprint}`, currentHeadline: item.headline });
        const qualificationStepResult = await runStep(`candidate-${i + 1}-qualification`, 'anthropic', async () => {
          const deterministic = deterministicEligibility(item);
          if (!deterministic.eligible) return { deterministic };
          processingStage = 'qualification';
          candidateDeps.failureStage = processingStage;
          return { qualification: normalizeQualificationResponse(await callClaudeJson(env, buildQualificationPrompt(item), 1400, candidateDeps)) };
        });
        if (qualificationStepResult.deterministic && !qualificationStepResult.deterministic.eligible) {
          summary.itemsRejected += 1;
          const rejectedCandidate = withCandidateMetadata({
            ...candidateFromTrackerItem(item),
            candidateId: `nt_${fingerprint}`,
            status: 'rejected_by_filter',
            rejectionReasons: qualificationStepResult.deterministic.reasons,
            dryRun,
            usage: candidateUsage,
          }, null, { runId });
          candidateForAttempt = rejectedCandidate;
          await store.saveCandidate(rejectedCandidate, { dryRun, runId });
          summary.completedItems += 1;
          summary.attemptedItems.push(attemptedItemFrom(item, rejectedCandidate, candidateUsage, 'rejected_by_filter'));
          await updateRun({ completedItems: summary.completedItems, percentComplete: progressPercent(summary.completedItems, summary.targetItems), itemsRejected: summary.itemsRejected, attemptedItems: summary.attemptedItems, usage: summary.usage });
          continue;
        }
        qualification = qualificationStepResult.qualification;
        const qValid = validateQualification(qualification);
        if (!qValid.ok) {
          const err = new Error(`Invalid qualification JSON: ${qValid.errors.join(',')}`);
          err.qualificationDiagnostic = safeModelDiagnostic(qualification?.rawModelResponse || JSON.stringify(qualification || {}));
          err.failureStatus = 'qualification_failed';
          err.failureStage = 'qualification';
          err.failureCode = 'qualification_json_invalid';
          throw err;
        }
        const nextStatus = qualificationStatus(qualification, config.minScore);
        if (nextStatus === 'rejected_by_filter') summary.itemsRejected += 1;
        if (nextStatus === 'needs_editorial_check') summary.itemsNeedingEditorialCheck += 1;
        let verification = null;
        let draft = null;
        let status = nextStatus;
        if (nextStatus !== 'rejected_by_filter') {
          processingStage = 'primary_source_discovery';
          candidateDeps.failureStage = processingStage;
          await updateRun({ phase: 'primary_source_discovery' });
          primaryDiscovery = await runStep(`candidate-${i + 1}-primary-source-discovery`, 'anthropic', async () => discoverPrimarySources(item, qualification, env, candidateDeps, { runId }));
          if (primaryDiscovery.status === 'failed') {
            status = 'needs_editorial_check';
            if (nextStatus !== 'needs_editorial_check') summary.itemsNeedingEditorialCheck += 1;
          } else if (['not_found', 'ambiguous'].includes(primaryDiscovery.status) && primarySourceDiscoveryRequired(item, qualification)) {
            status = 'needs_editorial_check';
            if (nextStatus !== 'needs_editorial_check') summary.itemsNeedingEditorialCheck += 1;
          }
        }
        if (nextStatus === 'verifying') {
          if (status === 'verifying') {
            processingStage = 'verification';
            candidateDeps.failureStage = processingStage;
            await updateRun({ phase: 'verifying' });
            verification = await runStep(`candidate-${i + 1}-verification`, 'default', async () => verifyCandidateSources(item, candidateDeps, primaryDiscovery));
            if (!verification.ok) status = 'verification_failed';
            else {
              summary.itemsVerified += 1;
              processingStage = 'drafting';
              candidateDeps.failureStage = processingStage;
              await updateRun({ phase: 'drafting' });
              status = 'drafting';
              draft = await runStep(`candidate-${i + 1}-drafting`, 'anthropic', async () => callClaudeJson(env, buildDraftPrompt({ item, qualification, verification, primarySources: primaryDiscovery?.primarySources || [] }), 1800, candidateDeps));
              const dValid = validateDraft(draft);
              if (!dValid.ok) {
                const err = new Error(`Invalid draft JSON: ${dValid.errors.join(',')}`);
                err.failureStatus = 'drafting_failed';
                err.failureStage = 'drafting_parse';
                err.failureCode = 'drafting_json_invalid';
                throw err;
              }
              status = 'awaiting_approval';
              summary.draftsGenerated += 1;
            }
          }
        }
        await updateRun({ phase: 'saving_results' });
        const candidate = await runStep(`candidate-${i + 1}-save-result`, 'default', async () => {
          const candidateBase = { ...candidateFromTrackerItem(item, qualification, verification, draft), status, dryRun, usage: candidateUsage };
          const savedCandidate = withCandidateMetadata(primaryDiscovery ? applyPrimarySourceDiscovery(candidateBase, primaryDiscovery) : candidateBase, null, { runId });
          await store.saveCandidate(savedCandidate, { dryRun, runId });
          await store.addActivity(savedCandidate.candidateId, 'qualification', { status, score: qualification.overallScore }, { dryRun });
          if (primaryDiscovery) await store.addActivity(savedCandidate.candidateId, 'primary_source_discovery', { status: primaryDiscovery.status, count: primaryDiscovery.primarySources.length }, { dryRun });
          return savedCandidate;
        });
        candidateForAttempt = candidate;
        if (status === 'awaiting_approval') awaiting.push(candidate);
        summary.completedItems += 1;
        summary.attemptedItems.push(attemptedItemFrom(item, candidate, candidateUsage, status));
        await updateRun({ completedItems: summary.completedItems, percentComplete: progressPercent(summary.completedItems, summary.targetItems), attemptedItems: summary.attemptedItems, usage: summary.usage, itemsRejected: summary.itemsRejected, itemsNeedingEditorialCheck: summary.itemsNeedingEditorialCheck, itemsVerified: summary.itemsVerified, draftsGenerated: summary.draftsGenerated, failures: summary.failures });
      } catch (e) {
        summary.failures += 1;
        const failure = createFailureMetadata(e, processingStage, runId);
        summary.errorSummary.push(stripEmptyOptionalFields({
          headline: item.headline,
          error: e.message,
          failureStage: failure.failureStage,
          failureCode: failure.failureCode,
          qualificationDiagnostic: e.qualificationDiagnostic || e.modelDiagnostic,
        }));
        const failedStatus = e.failureStatus || `${processingStage}_failed`;
        const failedBase = {
          ...candidateFromTrackerItem(item, qualification),
          status: failedStatus,
          dryRun,
          lastError: e.message,
          qualificationDiagnostic: e.qualificationDiagnostic || e.modelDiagnostic || '',
          usage: candidateUsage,
          ...failure,
        };
        const failedCandidate = withCandidateMetadata(primaryDiscovery ? applyPrimarySourceDiscovery(failedBase, primaryDiscovery) : failedBase, null, { runId });
        candidateForAttempt = failedCandidate;
        await store.saveCandidate(failedCandidate, { dryRun, runId }).catch(() => {});
        summary.completedItems += 1;
        summary.attemptedItems.push(attemptedItemFrom(item, candidateForAttempt, candidateUsage, 'failed', failure));
        await updateRun({ completedItems: summary.completedItems, percentComplete: progressPercent(summary.completedItems, summary.targetItems), attemptedItems: summary.attemptedItems, failures: summary.failures, errorSummary: summary.errorSummary, usage: summary.usage });
      }
    }

    if (!dryRun && config.emailEnabled && awaiting.length) {
      summary.emailsSent = await sendApprovalDigest(awaiting, env, deps);
    }
  } catch (e) {
    if (!e.alreadyRecordedInRun) {
      const failure = createFailureMetadata(e, e.failureStage || summary.phase || 'unknown', runId);
      summary.failures += 1;
      summary.failureStage = failure.failureStage;
      summary.failureCode = failure.failureCode;
      summary.failureMessage = failure.failureMessage;
      summary.errorSummary.push({ run: e.message, failureStage: failure.failureStage, failureCode: failure.failureCode });
    }
    summary.state = 'failed';
  } finally {
    const failed = summary.state === 'failed';
    if (!failed) summary.phase = 'completed';
    if (!failed) summary.state = summary.failures ? 'completed_with_failures' : 'completed';
    if (options.workflowInstanceId) summary.workflowState = failed ? 'failed' : 'completed';
    if (options.workflowInstanceId) summary.currentWorkflowStep = failed ? summary.currentWorkflowStep : 'completed';
    summary.completedItems = Number(summary.completedItems || 0);
    summary.targetItems = summary.targetItems === null ? summary.completedItems : summary.targetItems;
    summary.percentComplete = failed ? progressPercent(summary.completedItems, summary.targetItems) : 100;
    summary.endTime = new Date().toISOString();
    summary.duration = Date.now() - startedAt;
    summary.updatedAt = summary.endTime;
    summary.heartbeatAt = summary.endTime;
    summary.activeRun = false;
    await store.saveRun(summary, { dryRun }).catch(() => {});
  }
  return { ok: summary.failures === 0, summary };
}

async function saveChildCritical(store, runId, candidateId, patch, dryRun) {
  await store.saveChildRun(runId, candidateId, { ...patch, updatedAt: new Date().toISOString() }, { dryRun });
}

async function triggerFinalizerWorkflow(env, runId, candidateId, dryRun, store, externalUsage) {
  const instanceId = finalizerWorkflowInstanceId(runId, candidateId);
  if (!env[NEWS_BRIEF_FINALIZER_WORKFLOW_BINDING]?.create) throw Object.assign(new Error('finalizer workflow binding unavailable'), { failureStage: 'firestore_write', failureCode: 'finalizer_workflow_binding_unavailable' });
  externalUsage.workflowBindingCalls += 1;
  try {
    await env[NEWS_BRIEF_FINALIZER_WORKFLOW_BINDING].create({
      id: instanceId,
      params: { runId, candidateId, dryRun, workflowInstanceId: instanceId },
    });
  } catch (e) {
    if (!/already|exist|duplicate/i.test(e.message || '')) throw e;
  }
  await store.saveChildRun(runId, candidateId, { finalizerWorkflowInstanceId: instanceId, externalRequestUsage: externalUsage }, { dryRun });
  return { workflowInstanceId: instanceId, triggered: true };
}

export async function runNewsBriefCandidateWorkflow(env, options = {}, deps = {}) {
  const config = getAutomationConfig(env);
  const dryRun = options.dryRun !== undefined ? !!options.dryRun : config.dryRun;
  const runId = options.runId || '';
  const compact = options.candidate || {};
  const candidateId = compact.candidateId || '';
  if (!safeRunId(runId) || !candidateId) return { ok: false, error: 'invalid_candidate_workflow_payload' };
  const externalRequestUsage = createEmptyExternalRequestUsage();
  const fetchImpl = budgetedFetch(deps.fetch || fetch, externalRequestUsage);
  const candidateDeps = { ...deps, fetch: fetchImpl };
  const store = getStore(env, candidateDeps);
  const item = itemFromCompactCandidate(compact);
  let child = await store.getChildRun?.(runId, candidateId) || {};
  let qualification = child.qualificationResult || null;
  let primaryDiscovery = child.primarySourceDiscoveryResult || null;
  let verification = child.verificationResult || null;
  let draft = child.draftResult || null;
  let finalStatus = child.finalStatus || '';
  const usage = child.usage || createEmptyUsage();
  const anthropicCallLog = child.anthropicCallLog || [];
  let currentStage = child.currentStage || 'queued';
  let finalCandidate = null;
  const saveChild = async (patch) => {
    child = { ...child, ...patch, runId, candidateId, headline: compact.headline, sourceName: compact.sourceName, sourceUrl: compact.sourceUrl, dateFound: compact.dateFound };
    await saveChildCritical(store, runId, candidateId, child, dryRun);
  };
  let currentWorkflowAttempt = 1;
  const stageDeps = {
    ...candidateDeps,
    beforeAnthropicCall: async ({ model, stage }) => {
      const callId = `${stableHash(`${runId}:${candidateId}:${stage}:${Date.now()}:${Math.random()}`).slice(0, 18)}`;
      const entry = {
        callId,
        candidateId,
        headline: item.headline,
        stage,
        model,
        startedAt: new Date().toISOString(),
        completedAt: '',
        status: 'started',
        attempt: currentWorkflowAttempt,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        webSearchRequests: 0,
        durationMs: 0,
        failureCode: '',
      };
      anthropicCallLog.push(entry);
      await saveChild({ currentStage: stage, anthropicCallLog, currentAnthropicCallId: callId, currentAnthropicStage: stage, workflowState: 'running', applicationState: 'running' });
      return { callId };
    },
    afterAnthropicCall: async (result = {}) => {
      const callId = result.callId || child.currentAnthropicCallId;
      const increment = result.usage || {};
      anthropicCallLog.splice(0, anthropicCallLog.length, ...anthropicCallLog.map((entry) => entry.callId === callId ? {
        ...entry,
        completedAt: new Date().toISOString(),
        status: ['completed', 'timed_out', 'failed'].includes(result.status) ? result.status : 'failed',
        inputTokens: Number(increment.inputTokens || entry.inputTokens || 0),
        outputTokens: Number(increment.outputTokens || entry.outputTokens || 0),
        cacheCreationInputTokens: Number(increment.cacheCreationInputTokens || entry.cacheCreationInputTokens || 0),
        cacheReadInputTokens: Number(increment.cacheReadInputTokens || entry.cacheReadInputTokens || 0),
        webSearchRequests: Number(increment.webSearchRequests || entry.webSearchRequests || 0),
        durationMs: Number(result.durationMs || entry.durationMs || 0),
        failureCode: result.failureCode || entry.failureCode || '',
      } : entry));
      await saveChild({ anthropicCallLog, currentAnthropicCallId: '', currentAnthropicStage: '', lastCompletedAnthropicCallId: result.status === 'completed' ? callId : child.lastCompletedAnthropicCallId });
    },
    recordAnthropicUsage: (increment) => addUsage(usage, increment),
  };
  const runCandidateStep = async (name, fn) => workflowStep(deps, name, 'default', async (ctx) => {
    currentWorkflowAttempt = Number(ctx?.attempt || ctx?.step?.count || 1);
    return fn(ctx);
  });
  try {
    await runCandidateStep('initialise-candidate', async () => saveChild({
      workflowInstanceId: options.workflowInstanceId || child.workflowInstanceId || '',
      workflowState: 'running',
      applicationState: 'running',
      currentStage: 'qualification',
      candidateIndex: compact.candidateIndex,
      finalised: false,
      usage,
      externalRequestUsage,
    }));
    await runCandidateStep('process-candidate', async () => {
      const deterministic = deterministicEligibility(item);
      if (!deterministic.eligible) {
        finalStatus = 'rejected_by_filter';
        finalCandidate = withCandidateMetadata({
          ...candidateFromTrackerItem(item),
          candidateId,
          status: finalStatus,
          rejectionReasons: deterministic.reasons,
          dryRun,
          usage,
        }, null, { runId });
        await saveChild({ currentStage: 'finalise-candidate', finalStatus, qualificationResult: { deterministicRejection: true, rejectionReasons: deterministic.reasons }, usage, externalRequestUsage });
        return;
      }
      currentStage = 'qualification';
      await saveChild({ currentStage });
      if (!qualification) {
        qualification = normalizeQualificationResponse(await callClaudeJson(env, buildQualificationPrompt(item), 1400, { ...stageDeps, failureStage: 'qualification', stage: 'qualification' }));
      }
      const qValid = validateQualification(qualification);
      if (!qValid.ok) {
        const err = new Error(`Invalid qualification JSON: ${qValid.errors.join(',')}`);
        err.failureStage = 'qualification';
        err.failureCode = 'qualification_json_invalid';
        err.failureStatus = 'qualification_failed';
        throw err;
      }
      let status = qualificationStatus(qualification, config.minScore);
      await saveChild({ qualificationResult: sanitizeQualificationForStorage(qualification), currentStage: status === 'rejected_by_filter' ? 'finalise-candidate' : 'primary_source_discovery', usage, anthropicCallLog });
      if (status === 'rejected_by_filter') {
        finalStatus = status;
        finalCandidate = withCandidateMetadata({ ...candidateFromTrackerItem(item, qualification), candidateId, status, dryRun, usage }, null, { runId });
        return;
      }
      currentStage = 'primary_source_discovery';
      if (!primaryDiscovery) primaryDiscovery = await discoverPrimarySources(item, qualification, env, { ...stageDeps, failureStage: currentStage, stage: currentStage }, { runId });
      if (primaryDiscovery.status === 'failed' || (['not_found', 'ambiguous'].includes(primaryDiscovery.status) && primarySourceDiscoveryRequired(item, qualification)) || status === 'needs_editorial_check') {
        finalStatus = 'needs_editorial_check';
        finalCandidate = withCandidateMetadata(applyPrimarySourceDiscovery({ ...candidateFromTrackerItem(item, qualification), candidateId, status: finalStatus, dryRun, usage }, primaryDiscovery), null, { runId });
        await saveChild({ primarySourceDiscoveryResult: primaryDiscovery, primarySourceDiscoveryStatus: primaryDiscovery.status, primarySources: primaryDiscovery.primarySources || [], finalStatus, currentStage: 'finalise-candidate', usage, externalRequestUsage });
        return;
      }
      if (status === 'verifying') {
        currentStage = 'verification';
        await saveChild({ currentStage, primarySourceDiscoveryResult: primaryDiscovery, primarySourceDiscoveryStatus: primaryDiscovery.status, primarySources: primaryDiscovery.primarySources || [] });
        if (!verification) verification = await verifyCandidateSources(item, { ...stageDeps, failureStage: 'verification' }, primaryDiscovery);
        if (!verification.ok) {
          finalStatus = 'verification_failed';
          finalCandidate = withCandidateMetadata(applyPrimarySourceDiscovery({ ...candidateFromTrackerItem(item, qualification, verification), candidateId, status: finalStatus, dryRun, usage }, primaryDiscovery), null, { runId });
          await saveChild({ verificationResult: verification, finalStatus, currentStage: 'finalise-candidate', usage, externalRequestUsage });
          return;
        }
        currentStage = 'drafting';
        await saveChild({ currentStage, verificationResult: verification });
        if (!draft) draft = await callClaudeJson(env, buildDraftPrompt({ item, qualification, verification, primarySources: primaryDiscovery?.primarySources || [] }), 1800, { ...stageDeps, failureStage: 'drafting', stage: 'drafting' });
        const dValid = validateDraft(draft);
        if (!dValid.ok) {
          const err = new Error(`Invalid draft JSON: ${dValid.errors.join(',')}`);
          err.failureStage = 'drafting_parse';
          err.failureCode = 'drafting_json_invalid';
          err.failureStatus = 'drafting_failed';
          throw err;
        }
        finalStatus = 'awaiting_approval';
        finalCandidate = withCandidateMetadata(applyPrimarySourceDiscovery({ ...candidateFromTrackerItem(item, qualification, verification, draft), candidateId, status: finalStatus, dryRun, usage }, primaryDiscovery), null, { runId });
        await saveChild({ draftResult: draft, finalStatus, currentStage: 'finalise-candidate', usage, externalRequestUsage });
        return;
      }
      finalStatus = status;
      finalCandidate = withCandidateMetadata(primaryDiscovery ? applyPrimarySourceDiscovery({ ...candidateFromTrackerItem(item, qualification), candidateId, status, dryRun, usage }, primaryDiscovery) : { ...candidateFromTrackerItem(item, qualification), candidateId, status, dryRun, usage }, null, { runId });
    });
  } catch (e) {
    const code = e.failureCode || failureCodeForError(e, currentStage);
    const failure = createFailureMetadata({ ...e, failureCode: code }, currentStage, runId);
    finalStatus = e.failureStatus || (code === 'candidate_request_budget_reached' && qualification ? 'needs_editorial_check' : 'failed');
    finalCandidate = withCandidateMetadata(primaryDiscovery
      ? applyPrimarySourceDiscovery({ ...candidateFromTrackerItem(item, qualification), candidateId, status: finalStatus, dryRun, usage, ...failure }, primaryDiscovery)
      : { ...candidateFromTrackerItem(item, qualification), candidateId, status: finalStatus, dryRun, usage, ...failure }, null, { runId });
    await saveChild({ failureStage: failure.failureStage, failureCode: failure.failureCode, failureMessage: failure.failureMessage, retryable: failure.retryable, finalStatus, currentStage: 'finalise-candidate', usage, externalRequestUsage, qualificationResult: qualification ? sanitizeQualificationForStorage(qualification) : child.qualificationResult });
  }
  await runCandidateStep('finalise-candidate', async () => {
    const latest = await store.getChildRun?.(runId, candidateId);
    if (latest?.finalised) return latest;
    if (!finalCandidate) {
      const failure = createFailureMetadata(Object.assign(new Error('Candidate workflow reached finalisation without a final candidate outcome.'), { failureCode: 'candidate_workflow_completion_invariant_failed' }), currentStage, runId);
      finalStatus = 'failed';
      finalCandidate = withCandidateMetadata({ ...candidateFromTrackerItem(item, qualification), candidateId, status: finalStatus, dryRun, usage, ...failure }, null, { runId });
    }
    await store.saveCandidate(finalCandidate, { dryRun, runId });
    const attempted = attemptedItemFrom(item, finalCandidate, usage, finalStatus, finalCandidate.failureCode ? finalCandidate : null);
    await saveChild({
      workflowState: 'completed',
      applicationState: finalStatus === 'failed' || /_failed$/.test(finalStatus) ? 'failed' : 'completed',
      currentStage: 'completed',
      finalStatus,
      finalised: true,
      finalisedAt: new Date().toISOString(),
      attemptedItem: attempted,
      usage,
      externalRequestUsage,
      qualificationResult: qualification ? sanitizeQualificationForStorage(qualification) : child.qualificationResult,
      primarySourceDiscoveryResult: primaryDiscovery || child.primarySourceDiscoveryResult,
      primarySourceDiscoveryStatus: primaryDiscovery?.status || child.primarySourceDiscoveryStatus || '',
      primarySources: primaryDiscovery?.primarySources || child.primarySources || [],
      verificationResult: verification || child.verificationResult,
      draftResult: draft || child.draftResult,
    });
    return { finalised: true, finalStatus };
  });
  await runCandidateStep('trigger-run-finalizer', async () => triggerFinalizerWorkflow(env, runId, candidateId, dryRun, store, externalRequestUsage));
  const finalChild = await store.getChildRun?.(runId, candidateId);
  if (!finalChild?.finalised) throw new Error('candidate_workflow_completion_invariant_failed');
  return { ok: true, runId, candidateId, finalStatus };
}

export async function runNewsBriefFinalizerWorkflow(env, options = {}, deps = {}) {
  const config = getAutomationConfig(env);
  const dryRun = options.dryRun !== undefined ? !!options.dryRun : config.dryRun;
  const runId = options.runId || '';
  if (!safeRunId(runId)) return { ok: false, error: 'invalid_runId' };
  const store = getStore(env, deps);
  return workflowStep(deps, 'finalise-run', 'default', async () => {
    const run = await store.getRun(runId);
    if (!run) return { ok: false, error: 'run_not_found' };
    const children = childRecordsWithParentFallbacks(run, await store.listChildRuns(runId));
    const target = Number(run.targetItems ?? children.length ?? 0);
    const finalised = children.filter((child) => child.finalised === true);
    const usage = createEmptyUsage();
    const externalRequestUsage = createEmptyExternalRequestUsage();
    for (const child of finalised) {
      addUsage(usage, child.usage || {});
      addExternalUsage(externalRequestUsage, child.externalRequestUsage || {});
    }
    const completedItems = finalised.length;
    const percentComplete = target ? progressPercent(completedItems, target) : 100;
    const fallback = childDisplayFallbacks(run);
    const childWorkflowSummaries = children.map((child) => childSummaryFromRecord(child, fallback));
    const attemptedItems = finalised.map((child) => child.attemptedItem).filter(Boolean);
    const allTerminal = target === 0 || (target > 0 && completedItems === target && attemptedItems.length === target);
    const terminalState = allTerminal
      ? finalised.some((child) => child.applicationState === 'failed' || child.finalStatus === 'failed' || /_failed$/.test(child.finalStatus || '')) ? 'completed_with_failures' : 'completed'
      : 'running';
    const patch = {
      ...run,
      childWorkflowSummaries,
      completedItems,
      percentComplete,
      usage,
      externalRequestUsage,
      attemptedItems,
      updatedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      applicationState: terminalState,
      state: terminalState,
      activeRun: !allTerminal,
      phase: allTerminal ? 'completed' : run.phase,
      currentWorkflowStep: allTerminal ? 'completed' : run.currentWorkflowStep,
      currentCandidateId: allTerminal ? '' : run.currentCandidateId,
      currentHeadline: allTerminal ? '' : run.currentHeadline,
      endTime: allTerminal ? (run.endTime || new Date().toISOString()) : run.endTime,
      itemsRejected: finalised.filter((child) => child.finalStatus === 'rejected_by_filter').length,
      itemsNeedingEditorialCheck: finalised.filter((child) => child.finalStatus === 'needs_editorial_check').length,
      itemsVerified: finalised.filter((child) => child.verificationResult?.ok).length,
      draftsGenerated: finalised.filter((child) => child.finalStatus === 'awaiting_approval').length,
      failures: finalised.filter((child) => child.applicationState === 'failed' || child.finalStatus === 'failed' || /_failed$/.test(child.finalStatus || '')).length,
    };
    if (target > 0 && completedItems < target) {
      patch.applicationState = 'running';
      patch.state = 'running';
      patch.activeRun = true;
    }
    await store.saveRun(patch, { dryRun });
    return { ok: true, runId, completedItems, targetItems: target, completed: allTerminal };
  });
}

async function verifyCandidateSources(item, deps = {}, primaryDiscovery = null) {
  const fetchImpl = deps.fetch || fetch;
  const sources = [];
  for (const primary of primaryDiscovery?.primarySources || []) {
    if (!primary?.url) continue;
    try {
      const res = await fetchWithTimeout(primary.url, { headers: { 'User-Agent': 'WocultIntelligence/1.0 by Wocult' } }, 12000, fetchImpl);
      const text = await res.text();
      const prepared = prepareSourceContext(text, MAX_PRIMARY_SOURCE_TEXT_CHARS);
      sources.push({ ok: res.ok, url: primary.url, title: primary.title, publisher: primary.publisherOrIssuer, text: prepared.text, excerpt: prepared.text.slice(0, 700), truncated: prepared.truncated, type: primary.sourceType || 'primary' });
    } catch (e) {
      sources.push({ ok: false, url: primary.url, error: e.message });
    }
  }
  if (item.sourceUrl) {
    try {
      const res = await fetchWithTimeout(item.sourceUrl, { headers: { 'User-Agent': 'WocultIntelligence/1.0 by Wocult' } }, 12000, fetchImpl);
      const text = await res.text();
      const prepared = prepareSourceContext(text, MAX_ARTICLE_TEXT_CHARS);
      sources.push({ ok: res.ok, url: item.sourceUrl, title: item.headline, publisher: item.source, text: prepared.text, excerpt: prepared.text.slice(0, 700), truncated: prepared.truncated, type: /gov|court|sebi|rbi|bseindia|nseindia|company|investor|annual|filing/i.test(item.sourceUrl) ? 'primary' : 'secondary' });
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
  const collectionId = env.WEBFLOW_NEWS_COLLECTION_ID || WEBFLOW_NEWS_COLLECTION_ID;
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

async function getAutomationStatus(env, deps = {}, runId = '') {
  const store = getStore(env, deps);
  const config = getAutomationConfig(env);
  const attachChildren = async (run) => {
    if (!run) return run;
    if (!store.listChildRuns || !(Array.isArray(run.selectedCandidates) || Array.isArray(run.candidateWorkflowIds))) return run;
    const children = childRecordsWithParentFallbacks(run, await store.listChildRuns(run.runId));
    const target = Number(run.targetItems ?? children.length ?? 0);
    const finalised = children.filter((child) => child.finalised === true);
    const completedItems = finalised.length;
    const percentComplete = target ? progressPercent(completedItems, target) : (target === 0 ? 100 : null);
    const usage = createEmptyUsage();
    const externalRequestUsage = createEmptyExternalRequestUsage();
    for (const child of finalised) {
      addUsage(usage, child.usage || {});
      addExternalUsage(externalRequestUsage, child.externalRequestUsage || {});
    }
    const fallback = childDisplayFallbacks(run);
    const childWorkflowSummaries = children.map((child) => childSummaryFromRecord(child, fallback));
    return {
      ...run,
      childWorkflowSummaries,
      completedItems,
      percentComplete,
      usage,
      externalRequestUsage,
      activeRun: ['preparing', 'running'].includes(logicalRunState(run)) && completedItems < target,
    };
  };
  if (runId) {
    let run = await store.getRun(runId);
    run = await reconcileWorkflowRunState(env, store, run, config.dryRun);
    if (activeRunIsStale(run) && !workflowStateIsActive(run?.workflowState)) run = await recoverStaleRun(store, run, config.dryRun);
    run = await attachChildren(run);
    return { ok: !!run, run: run || null };
  }
  let activeRun = store.activeRun ? await store.activeRun() : null;
  activeRun = await reconcileWorkflowRunState(env, store, activeRun, config.dryRun);
  activeRun = await attachChildren(activeRun);
  if (activeRunIsStale(activeRun) && !workflowStateIsActive(activeRun?.workflowState)) {
    await recoverStaleRun(store, activeRun, config.dryRun);
    activeRun = null;
  } else if (workflowStateIsTerminal(activeRun?.workflowState) && !['preparing', 'running'].includes(logicalRunState(activeRun))) {
    activeRun = null;
  }
  return {
    ok: true,
    config: redactConfig(config),
    counts: await store.statusCounts(),
    activeRun,
    latestCompletedRun: store.latestCompletedRun ? await store.latestCompletedRun() : null,
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
    async existingFingerprints(fingerprints = []) {
      const found = [];
      for (let i = 0; i < fingerprints.length; i += 30) {
        const chunk = fingerprints.slice(i, i + 30);
        if (!chunk.length) continue;
        const body = structuredQuery('news_brief_automation', [{ field: 'storyFingerprint', op: 'IN', value: chunk }], chunk.length);
        const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
        const rows = await res.json();
        rows.filter((r) => r.document).map((r) => fromFirestoreDoc(r.document)).forEach((doc) => {
          if (doc.storyFingerprint) found.push(doc.storyFingerprint);
        });
      }
      return found;
    },
    async suppressedClusterKeys(clusterKeys = []) {
      const found = [];
      const cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
      for (let i = 0; i < clusterKeys.length; i += 30) {
        const chunk = clusterKeys.slice(i, i + 30);
        if (!chunk.length) continue;
        const body = structuredQuery('news_brief_automation', [
          { field: 'clusterKey', op: 'IN', value: chunk },
          { field: 'status', op: 'EQUAL', value: 'declined' },
          { field: 'decisionTimestamp', op: 'GREATER_THAN', value: cutoff },
        ], chunk.length);
        const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
        const rows = await res.json();
        rows.filter((r) => r.document).map((r) => fromFirestoreDoc(r.document)).forEach((doc) => {
          if (doc.clusterKey) found.push(doc.clusterKey);
        });
      }
      return found;
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
    async getRun(id) {
      const res = await firestoreFetch(`${root}/news_brief_automation_runs/${encodeURIComponent(id)}`, env, fetchImpl);
      if (res.status === 404) return null;
      return fromFirestoreDoc(await res.json());
    },
    async getChildRun(runId, candidateId) {
      const res = await firestoreFetch(`${root}/news_brief_automation_runs/${encodeURIComponent(runId)}/children/${encodeURIComponent(candidateId)}`, env, fetchImpl);
      if (res.status === 404) return null;
      return fromFirestoreDoc(await res.json());
    },
    async saveChildRun(runId, candidateId, child) {
      const fields = { ...child, runId, candidateId };
      const target = new URL(`${root}/news_brief_automation_runs/${encodeURIComponent(runId)}/children/${encodeURIComponent(candidateId)}`);
      for (const field of Object.keys(fields)) target.searchParams.append('updateMask.fieldPaths', field);
      await firestoreFetch(target.toString(), env, fetchImpl, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFirestoreFields(fields) }),
      });
    },
    async listChildRuns(runId) {
      const res = await firestoreFetch(`${root}/news_brief_automation_runs/${encodeURIComponent(runId)}/children`, env, fetchImpl);
      if (res.status === 404) return [];
      const data = await res.json();
      return (data.documents || []).map(fromFirestoreDoc);
    },
    async saveRun(summary, options = {}) {
      const target = new URL(`${root}/news_brief_automation_runs/${encodeURIComponent(summary.runId)}`);
      if (options.createOnly) target.searchParams.set('currentDocument.exists', 'false');
      await firestoreFetch(target.toString(), env, fetchImpl, {
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
    async activeRun() {
      const body = structuredQuery('news_brief_automation_runs', [{ field: 'state', op: 'IN', value: ['preparing', 'running'] }], 10);
      const res = await firestoreFetch(`${root}:runQuery`, env, fetchImpl, { method: 'POST', body: JSON.stringify(body) });
      const rows = await res.json();
      const runs = rows.filter((r) => r.document).map((r) => fromFirestoreDoc(r.document))
        .sort((a, b) => Date.parse(b.heartbeatAt || b.updatedAt || b.startTime || 0) - Date.parse(a.heartbeatAt || a.updatedAt || a.startTime || 0));
      return runs[0] || null;
    },
    async latestCompletedRun() {
      const runs = await this.latestRuns(10);
      return runs.find((run) => ['completed', 'completed_with_failures', 'failed'].includes(run.state)) || null;
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
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|aside|form|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function prepareSourceContext(value, maxChars = MAX_TOTAL_SOURCE_CONTEXT_CHARS) {
  const plain = stripHtml(value);
  const seen = new Set();
  const paragraphs = plain
    .split(/(?:\r?\n|\.\s+)/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 30)
    .filter((part) => {
      const key = normalizeText(part).slice(0, 180);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const joined = paragraphs.length ? paragraphs.join('. ') : plain;
  const limit = Math.max(200, Number(maxChars || MAX_TOTAL_SOURCE_CONTEXT_CHARS));
  const truncated = joined.length > limit;
  return {
    text: safeShortText(joined, limit),
    originalChars: plain.length,
    preparedChars: Math.min(joined.length, limit),
    truncated,
  };
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
  } catch (e) {
    if (controller.signal.aborted) {
      const err = new Error('request_timeout');
      err.name = 'AbortError';
      throw err;
    }
    throw e;
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
