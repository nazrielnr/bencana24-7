import {XMLParser} from 'fast-xml-parser';

const BMKG_ATTRIBUTION = 'Sumber data: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)';

const WEATHER_ENDPOINT = 'https://api.bmkg.go.id/publik/prakiraan-cuaca';
const AUTOGEMPA_ENDPOINT = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
const GEMPA_TERKINI_ENDPOINT = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json';
const GEMPA_DIRASAKAN_ENDPOINT = 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json';
const WEATHER_FALLBACKS: Record<string, string[]> = {
  '11.71.01.1001': ['11.71.04.2001'],
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const BMKG_FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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

async function fetchBmkgWithRetry(url: string, ttlSeconds: number): Promise<Response> {
  const init: RequestInit & {cf?: Record<string, unknown>} = {
    method: 'GET',
    headers: {
      'User-Agent': 'siaga-worker/1.0',
      Accept: '*/*',
    },
    cf: {
      cacheEverything: true,
      cacheTtl: ttlSeconds,
    },
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, BMKG_FETCH_TIMEOUT_MS);
      if (response.ok) {
        return response;
      }

      if (attempt === 0 && response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }

      throw new Error(`BMKG request failed (${response.status}) for ${url}`);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Unknown BMKG fetch error';
  throw new Error(`BMKG request failed for ${url}: ${message}`);
}

async function fetchTextWithCache(url: string, ttlSeconds: number, ctx: ExecutionContext): Promise<string> {
  const cache = await caches.open('bmkg-cache');
  const cacheKey = new Request(url, {method: 'GET'});
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.text();
  }

  const response = await fetchBmkgWithRetry(url, ttlSeconds);

  const text = await response.text();
  const cacheResponse = new Response(text, {
    headers: {
      'Cache-Control': `public, max-age=${ttlSeconds}`,
      'Content-Type': response.headers.get('Content-Type') || 'text/plain',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  return text;
}

async function fetchJsonWithCache<T>(url: string, ttlSeconds: number, ctx: ExecutionContext): Promise<T> {
  const text = await fetchTextWithCache(url, ttlSeconds, ctx);
  return JSON.parse(text) as T;
}

function parseWeatherCellValue(value: string): number | null {
  const cleaned = value.trim();
  const rangeMatch = cleaned.match(/(\d{1,2}(?:\.\d+)?)\s*[–-]\s*(\d{1,2}(?:\.\d+)?)/);
  if (rangeMatch) {
    return Math.round((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2);
  }

  const numericMatch = cleaned.match(/\d{1,2}(?:\.\d+)?/);
  return numericMatch ? Math.round(Number(numericMatch[0])) : null;
}

function parseWeatherFallbackFromHtml(html: string, locationName?: string): {weatherDesc: string; temp: number | null; humidity: number | null} | null {
  const candidates = locationName
    ? [`Kota ${locationName}`, locationName]
    : [];

  for (const candidate of candidates) {
    const candidateIndex = html.indexOf(candidate);
    if (candidateIndex < 0) {
      continue;
    }

    const afterLabel = html.slice(candidateIndex + candidate.length, candidateIndex + candidate.length + 2400);
    const match = afterLabel.match(/<span>([^<]+)<\/span>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>([^<]+)<\/span>/);
    if (match) {
      const weatherDesc = match[1].trim();
      const temp = parseWeatherCellValue(match[2]);
      const humidity = parseWeatherCellValue(match[3]);
      return {weatherDesc, temp, humidity};
    }
  }

  const firstRowMatch = html.match(/<a href="\/cuaca\/prakiraan-cuaca\/[^"]+"[^>]*><span>[^<]+<\/span>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>([^<]+)<\/span>/);
  if (firstRowMatch) {
    return {
      weatherDesc: firstRowMatch[1].trim(),
      temp: parseWeatherCellValue(firstRowMatch[2]),
      humidity: parseWeatherCellValue(firstRowMatch[3]),
    };
  }

  return null;
}

function buildFallbackWeatherPayload(adm4: string, locationName: string | undefined, html: string): any {
  const extracted = parseWeatherFallbackFromHtml(html, locationName);
  const weatherDesc = extracted?.weatherDesc || 'Tidak diketahui';
  const temp = extracted?.temp ?? null;
  const humidity = extracted?.humidity ?? null;

  return {
    lokasi: {
      adm4,
      provinsi: locationName || `ADM4 ${adm4}`,
      kota: locationName || null,
    },
    data: [
      {
        cuaca: [
          [
            {
              local_datetime: new Date().toISOString(),
              t: temp,
              hu: humidity,
              ws: null,
              wd: null,
              tp: 0,
              weather_desc: weatherDesc,
            },
          ],
        ],
      },
    ],
    source: 'bmkg-html-fallback',
    attribution: BMKG_ATTRIBUTION,
  };
}

export async function getWeatherByAdm4(adm4: string, ctx: ExecutionContext, locationName?: string): Promise<any> {
  const candidates = [adm4, ...(WEATHER_FALLBACKS[adm4] || [])];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const url = `${WEATHER_ENDPOINT}?adm4=${encodeURIComponent(candidate)}`;
      return await fetchJsonWithCache<any>(url, 20 * 60, ctx);
    } catch (error) {
      lastError = error;
    }
  }

  const provinceCode = adm4.split('.')[0];
  try {
    const htmlUrl = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${provinceCode}`;
    const html = await fetchTextWithCache(htmlUrl, 20 * 60, ctx);
    return buildFallbackWeatherPayload(adm4, locationName, html);
  } catch (error) {
    lastError = error;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`BMKG request failed for ${WEATHER_ENDPOINT}`);
}

export async function getAutoGempa(ctx: ExecutionContext): Promise<any> {
  return fetchJsonWithCache<any>(AUTOGEMPA_ENDPOINT, 90, ctx);
}

export async function getGempaTerkini(ctx: ExecutionContext): Promise<any> {
  return fetchJsonWithCache<any>(GEMPA_TERKINI_ENDPOINT, 90, ctx);
}

export async function getGempaDirasakan(ctx: ExecutionContext): Promise<any> {
  return fetchJsonWithCache<any>(GEMPA_DIRASAKAN_ENDPOINT, 90, ctx);
}

export async function getNowcastFeed(lang: 'id' | 'en', ctx: ExecutionContext): Promise<any> {
  const url = `https://www.bmkg.go.id/alerts/nowcast/${lang}`;
  const xml = await fetchTextWithCache(url, 120, ctx);
  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel;
  const itemsRaw = channel?.item;
  const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : [];

  return {
    title: channel?.title || 'BMKG Nowcast',
    lastBuildDate: channel?.lastBuildDate || null,
    items: items.map((item: any) => ({
      title: item?.title || null,
      link: item?.link || null,
      description: item?.description || null,
      author: item?.author || null,
      pubDate: item?.pubDate || null,
    })),
    attribution: BMKG_ATTRIBUTION,
  };
}

export async function getNowcastDetail(lang: 'id' | 'en', code: string, ctx: ExecutionContext): Promise<any> {
  const normalizedCode = code.replace('_alert.xml', '').trim();
  const url = `https://www.bmkg.go.id/alerts/nowcast/${lang}/${normalizedCode}_alert.xml`;
  const xml = await fetchTextWithCache(url, 120, ctx);
  const parsed = parser.parse(xml);

  const alert = parsed?.alert;
  const infoRaw = alert?.info;
  const infos = Array.isArray(infoRaw) ? infoRaw : infoRaw ? [infoRaw] : [];
  const info = infos[0] || null;

  const areaRaw = info?.area;
  const areas = Array.isArray(areaRaw) ? areaRaw : areaRaw ? [areaRaw] : [];

  return {
    identifier: alert?.identifier || null,
    sender: alert?.sender || null,
    sent: alert?.sent || null,
    status: alert?.status || null,
    msgType: alert?.msgType || null,
    scope: alert?.scope || null,
    event: info?.event || null,
    urgency: info?.urgency || null,
    severity: info?.severity || null,
    certainty: info?.certainty || null,
    effective: info?.effective || null,
    expires: info?.expires || null,
    senderName: info?.senderName || null,
    headline: info?.headline || null,
    description: info?.description || null,
    web: info?.web || null,
    areas: areas.map((area: any) => ({
      areaDesc: area?.areaDesc || null,
      polygon: area?.polygon || null,
    })),
    attribution: BMKG_ATTRIBUTION,
  };
}

export function getBmkgAttribution() {
  return BMKG_ATTRIBUTION;
}
