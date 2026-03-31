import { XMLParser } from 'fast-xml-parser';
import { NewsItem, NewsSearchRequest, NewsSearchResponse } from '../types';

const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search';
const GOOGLE_NEWS_DEFAULT_HL = 'id';
const GOOGLE_NEWS_DEFAULT_GL = 'ID';
const GOOGLE_NEWS_DEFAULT_CEID = 'ID:id';
const NEWS_FETCH_TIMEOUT_MS = 12_000;
const NEWS_CACHE_TTL_SECONDS = 600;

const GEMPA_KEYWORDS = ['gempa', 'seismik', 'tektonik', 'tsunami', 'aftershock', 'magnitudo', 'bmkg'];
const CUACA_KEYWORDS = ['cuaca', 'hujan', 'angin', 'banjir', 'badai', 'petir', 'longsor', 'iklim'];
const BENCANA_KEYWORDS = Array.from(new Set([
  ...GEMPA_KEYWORDS,
  ...CUACA_KEYWORDS,
  'bencana',
  'darurat',
  'evakuasi',
  'korban',
  'erupsi',
  'gunung',
  'kebakaran',
  'bpbd',
  'bnpb',
]));
const NOISE_TOKENS = new Set([
  'berita',
  'terkini',
  'status',
  'wilayah',
  'sekitar',
  'pusat',
  'berada',
  'kondisi',
  'update',
  'info',
  'lokasi',
  'terjadi',
  'km',
]);
const DIRECTIONAL_TOKENS = new Set([
  'barat',
  'timur',
  'utara',
  'selatan',
  'tengah',
  'daya',
  'laut',
  'tenggara',
  'baratdaya',
  'baratlaut',
  'timurlaut',
]);
const DISTANCE_TOKENS = new Set(['km', 'kilometer', 'kilo', 'meter', 'm']);

const TOKEN_REPLACEMENTS: Record<string, string[]> = {
  papuapgngn: ['papua', 'pegunungan'],
  papuabaratdaya: ['papua', 'barat', 'daya'],
  baratdaya: ['barat', 'daya'],
  baratlaut: ['barat', 'laut'],
  timurlaut: ['timur', 'laut'],
  tenggara: ['tenggara'],
};

interface GoogleRssItem {
  title?: unknown;
  link?: unknown;
  guid?: unknown;
  pubDate?: unknown;
  description?: unknown;
  source?: unknown;
  'media:thumbnail'?: unknown;
  'media:content'?: unknown;
}

interface GoogleRssResponse {
  rss?: {
    channel?: {
      item?: GoogleRssItem | GoogleRssItem[];
    };
  };
}

const rssParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  processEntities: true,
});

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity: string) => {
    const lower = entity.toLowerCase();

    if (lower.startsWith('#')) {
      const isHex = lower.startsWith('#x');
      const rawCode = lower.slice(isHex ? 2 : 1);
      const code = Number.parseInt(rawCode, isHex ? 16 : 10);
      if (!Number.isNaN(code)) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return full;
        }
      }
      return full;
    }

    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'nbsp') return ' ';
    return full;
  });
}

function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const withoutTags = value.replace(/<[^>]*>/g, ' ');
  return normalizeSpaces(decodeHtmlEntities(withoutTags));
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return sanitizeText(value);
  if (!value || typeof value !== 'object') return '';

  const row = value as Record<string, unknown>;
  if (typeof row['#text'] === 'string') return sanitizeText(row['#text']);
  if (typeof row['__text'] === 'string') return sanitizeText(row['__text']);
  return '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toIsoDate(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return new Date(0).toISOString();
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date(0).toISOString();
}

function getSnippet(description: string): string {
  if (!description) return '';
  if (description.length <= 180) return description;
  return `${description.slice(0, 177).trim()}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildReadableSnippet(description: string, title: string, source: string): string {
  const normalizedDescription = sanitizeText(description);
  if (!normalizedDescription) return '';

  let readable = normalizedDescription;
  if (title) {
    readable = readable.replace(new RegExp(escapeRegExp(title), 'gi'), ' ');
  }
  if (source) {
    readable = readable.replace(new RegExp(escapeRegExp(source), 'gi'), ' ');
  }

  readable = readable
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-:\s]+/, '')
    .replace(/[-:\s]+$/, '')
    .trim();

  return readable;
}

function getTopicBoost(topic: string, text: string): number {
  if (!topic || topic === 'umum') return 0;
  if (topic === 'gempa' && GEMPA_KEYWORDS.some((k) => text.includes(k))) return 3;
  if (topic === 'cuaca' && CUACA_KEYWORDS.some((k) => text.includes(k))) return 3;
  if (topic === 'bencana' && BENCANA_KEYWORDS.some((k) => text.includes(k))) return 3;
  return 0;
}

function expandToken(rawToken: string): string[] {
  const token = rawToken.trim().toLowerCase();
  if (!token) return [];
  if (/^\d+$/.test(token)) return [];
  return TOKEN_REPLACEMENTS[token] || [token];
}

function normalizeQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .flatMap(expandToken)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !NOISE_TOKENS.has(token));
}

function toCoreLocationTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !DIRECTIONAL_TOKENS.has(token) && !DISTANCE_TOKENS.has(token));
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

function prependTopicToken(tokens: string[], topic: string): string[] {
  if (topic === 'gempa' && !tokens.includes('gempa')) {
    return ['gempa', ...tokens];
  }
  if (topic === 'cuaca' && !tokens.includes('cuaca')) {
    return ['cuaca', ...tokens];
  }
  if (topic === 'bencana' && !tokens.includes('bencana')) {
    return ['bencana', ...tokens];
  }
  return tokens;
}

function buildTopicFallback(topic: string): string {
  if (topic === 'gempa') return 'gempa indonesia';
  if (topic === 'cuaca') return 'cuaca indonesia';
  if (topic === 'bencana') return 'bencana indonesia gempa banjir longsor cuaca ekstrem';
  return 'berita indonesia';
}

function buildSearchVariants(query: string, topic: string, location?: string): string[] {
  const queryTokens = normalizeQueryTokens(query);
  const locationTokens = normalizeQueryTokens(location || '');
  const queryCore = toCoreLocationTokens(queryTokens);
  const locationCore = toCoreLocationTokens(locationTokens);

  const primaryTokens = prependTopicToken(uniqueTokens([...queryCore, ...locationCore]), topic).slice(0, 8);
  const secondaryTokens = prependTopicToken(uniqueTokens(locationCore.length > 0 ? locationCore : queryCore), topic).slice(0, 6);
  const primary = primaryTokens.length > 0 ? primaryTokens.join(' ') : buildTopicFallback(topic);
  const secondary = secondaryTokens.length > 0 ? secondaryTokens.join(' ') : '';
  const topicFallback = buildTopicFallback(topic);

  return Array.from(new Set([primary, secondary, topicFallback].filter((value) => value && value.trim().length > 0)));
}

function countMatches(text: string, tokens: string[]): number {
  const unique = Array.from(new Set(tokens));
  let count = 0;
  for (const token of unique) {
    if (text.includes(token)) count += 1;
  }
  return count;
}

function toRelevanceScore(item: NewsItem, tokens: string[], topic: string): number {
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const snippet = item.snippet.toLowerCase();
  const merged = `${title} ${description} ${snippet}`;

  let score = getTopicBoost(topic, merged);

  for (const token of tokens) {
    if (title.includes(token)) score += 5;
    if (description.includes(token)) score += 2;
    if (snippet.includes(token)) score += 1;
  }

  const publishedTime = new Date(item.publishedAt).getTime();
  if (!Number.isNaN(publishedTime) && publishedTime > 0) {
    const hoursAgo = (Date.now() - publishedTime) / (1000 * 60 * 60);
    if (hoursAgo < 24) score += 2;
    else if (hoursAgo < 72) score += 1;
  }

  return score;
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const unique: NewsItem[] = [];

  for (const item of items) {
    const urlKey = item.url.trim();
    const titleKey = toTitleKey(item.title);

    if (!urlKey && !titleKey) continue;
    if (urlKey && seenUrls.has(urlKey)) continue;
    if (titleKey && seenTitles.has(titleKey)) continue;

    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    unique.push(item);
  }

  return unique;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { cf?: Record<string, unknown> },
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithCache(url: string, ttlSeconds: number, ctx: ExecutionContext): Promise<string> {
  const cache = await caches.open('news-cache');
  const cacheKey = new Request(url, { method: 'GET' });
  const cached = await cache.match(cacheKey);

  if (cached) {
    return await cached.text();
  }

  const init: RequestInit & { cf?: Record<string, unknown> } = {
    method: 'GET',
    headers: {
      'User-Agent': 'siaga-worker/1.0',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
    cf: {
      cacheEverything: true,
      cacheTtl: ttlSeconds,
    },
  };

  const response = await fetchWithTimeout(url, init, NEWS_FETCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`News request failed (${response.status}) for ${url}`);
  }

  const payload = await response.text();
  const cacheResponse = new Response(payload, {
    headers: {
      'Cache-Control': `public, max-age=${ttlSeconds}`,
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  return payload;
}

function toGoogleRssUrl(searchQuery: string): string {
  const url = new URL(GOOGLE_NEWS_RSS_URL);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('hl', GOOGLE_NEWS_DEFAULT_HL);
  url.searchParams.set('gl', GOOGLE_NEWS_DEFAULT_GL);
  url.searchParams.set('ceid', GOOGLE_NEWS_DEFAULT_CEID);
  return url.toString();
}

function parseGoogleRssItems(xml: string): GoogleRssItem[] {
  try {
    const parsed = rssParser.parse(xml) as GoogleRssResponse;
    const rows = parsed?.rss?.channel?.item;
    if (!rows) return [];
    return Array.isArray(rows) ? rows : [rows];
  } catch {
    return [];
  }
}

function readMediaUrl(item: GoogleRssItem): string {
  const thumbnail = item['media:thumbnail'];
  if (thumbnail && typeof thumbnail === 'object' && !Array.isArray(thumbnail)) {
    const value = (thumbnail as Record<string, unknown>)['@_url'];
    if (typeof value === 'string') return sanitizeText(value);
  }

  const content = item['media:content'];
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const value = (content as Record<string, unknown>)['@_url'];
    if (typeof value === 'string') return sanitizeText(value);
  }

  return '';
}

function readSource(item: GoogleRssItem, title: string): string {
  const source = extractText(item.source);
  if (source) return source;

  const chunks = title.split(' - ').map((row) => row.trim()).filter(Boolean);
  if (chunks.length > 1) return chunks[chunks.length - 1];
  return 'Google News';
}

function readSourceUrl(item: GoogleRssItem): string {
  const source = item.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return '';
  const value = (source as Record<string, unknown>)['@_url'];
  return typeof value === 'string' ? sanitizeText(value) : '';
}

function getSourceFaviconUrl(sourceUrl: string): string {
  if (!sourceUrl) return '';

  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!host) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return '';
  }
}

function trimTitleSourceSuffix(title: string, source: string): string {
  if (!title || !source) return title;
  const suffix = ` - ${source}`;
  const lowerTitle = title.toLowerCase();
  const lowerSuffix = suffix.toLowerCase();
  if (!lowerTitle.endsWith(lowerSuffix)) return title;
  return title.slice(0, title.length - suffix.length).trim();
}

function mapGoogleRssItem(item: GoogleRssItem, index: number): NewsItem | null {
  const rawTitle = extractText(item.title);
  const url = extractText(item.link);
  if (!rawTitle || !url) return null;

  const source = readSource(item, rawTitle);
  const title = trimTitleSourceSuffix(rawTitle, source) || rawTitle;
  const description = extractText(item.description);
  const readableDescription = buildReadableSnippet(description, title, source);
  const snippet = getSnippet(readableDescription || description || title);
  const publishedAt = toIsoDate(extractText(item.pubDate));
  const image = readMediaUrl(item) || getSourceFaviconUrl(readSourceUrl(item));

  const idBase = toTitleKey(extractText(item.guid) || url || `${title}-${index}`) || `item-${index}`;
  return {
    id: `gnews:${idBase}`,
    title,
    description,
    snippet,
    url,
    source,
    publishedAt,
    ...(image ? { image } : {}),
  };
}

function normalizeTopic(raw: string | undefined): string {
  const lowered = (raw || '').toLowerCase();
  if (lowered.includes('gempa')) return 'gempa';
  if (lowered.includes('cuaca')) return 'cuaca';
  if (lowered.includes('bencana') || lowered.includes('disaster')) return 'bencana';
  return 'umum';
}

function buildSearchQuery(query: string, topic: string, location?: string): string {
  const variants = buildSearchVariants(sanitizeText(query), topic, sanitizeText(location || ''));
  return variants[0] || buildTopicFallback(topic);
}

export function detectNewsTopic(value: string): string {
  const lowered = (value || '').toLowerCase();
  if (GEMPA_KEYWORDS.some((keyword) => lowered.includes(keyword))) return 'gempa';
  if (CUACA_KEYWORDS.some((keyword) => lowered.includes(keyword))) return 'cuaca';
  if (BENCANA_KEYWORDS.some((keyword) => lowered.includes(keyword))) return 'bencana';
  return 'umum';
}

export function buildNewsQueryFromPrompt(prompt: string, locationName?: string): { query: string; topic: string } {
  const topic = detectNewsTopic(prompt);
  const location = sanitizeText(locationName || '');
  const basePrompt = sanitizeText(prompt);

  if (topic === 'gempa') {
    return { query: buildSearchQuery(basePrompt, topic, location), topic };
  }

  if (topic === 'cuaca') {
    return { query: buildSearchQuery(basePrompt, topic, location), topic };
  }

  const normalizedPrompt = buildSearchQuery(basePrompt, topic, location);
  return { query: normalizedPrompt || 'berita indonesia', topic };
}

export async function searchNews(request: NewsSearchRequest, ctx: ExecutionContext): Promise<NewsSearchResponse> {
  const topic = normalizeTopic(request.topic);
  const limit = clamp(Number(request.limit || 5), 1, 20);
  const offset = Math.max(0, Number.parseInt(request.cursor || '0', 10) || 0);
  const strict = !!request.strict;
  const variants = buildSearchVariants(request.query, topic, request.location);
  const query = variants[0] || buildTopicFallback(topic);

  const settled = await Promise.allSettled(
    variants.map(async (searchQuery) => {
      const url = toGoogleRssUrl(searchQuery);
      const xml = await fetchTextWithCache(url, NEWS_CACHE_TTL_SECONDS, ctx);
      const rows = parseGoogleRssItems(xml).slice(0, 80);
      return rows.map(mapGoogleRssItem).filter((item): item is NewsItem => !!item);
    }),
  );

  const merged: NewsItem[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      merged.push(...result.value);
    }
  }

  const deduped = dedupeNews(merged);
  const tokens = toCoreLocationTokens(normalizeQueryTokens(query));
  const locationTokensRaw = normalizeQueryTokens(request.location || request.query || '');
  const locationTokens = toCoreLocationTokens(locationTokensRaw).filter((token) => token !== 'indonesia');
  const topicKeywords = topic === 'gempa'
    ? GEMPA_KEYWORDS
    : topic === 'cuaca'
      ? CUACA_KEYWORDS
      : topic === 'bencana'
        ? BENCANA_KEYWORDS
        : [];
  const enforceDisasterStrict = strict && (topic === 'bencana' || topic === 'umum');

  const filtered = deduped.filter((item) => {
    const mergedText = `${item.title} ${item.description} ${item.snippet}`.toLowerCase();
    const tokenHits = countMatches(mergedText, tokens);
    const queryThreshold = tokens.length >= 4 ? 2 : tokens.length > 0 ? 1 : 0;
    const tokenMatch = queryThreshold > 0 ? tokenHits >= queryThreshold : false;

    const topicMatch = topicKeywords.some((keyword) => mergedText.includes(keyword));
    const disasterMatch = BENCANA_KEYWORDS.some((keyword) => mergedText.includes(keyword));
    const locationHits = countMatches(mergedText, locationTokens);
    const locationThreshold = locationTokens.length > 0 ? 1 : 0;
    const locationMatch = locationThreshold > 0 ? locationHits >= locationThreshold : true;

    if (enforceDisasterStrict && !disasterMatch) {
      return false;
    }

    if (tokens.length === 0 && topicKeywords.length === 0) return true;

    const baseMatch = tokens.length === 0 ? topicMatch : (tokenMatch || topicMatch);
    if (!baseMatch) return false;

    if (strict && !locationMatch) {
      return false;
    }

    return true;
  });

  const rankedPool = strict ? filtered : (filtered.length > 0 ? filtered : deduped);

  rankedPool.sort((left, right) => {
    const leftScore = toRelevanceScore(left, tokens, topic);
    const rightScore = toRelevanceScore(right, tokens, topic);
    if (leftScore !== rightScore) return rightScore - leftScore;

    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });

  const items = rankedPool.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < rankedPool.length ? String(nextOffset) : undefined;

  return {
    query,
    topic,
    location: sanitizeText(request.location || ''),
    total: rankedPool.length,
    nextCursor,
    items,
    generatedAt: new Date().toISOString(),
  };
}
