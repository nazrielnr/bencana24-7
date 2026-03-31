import {
  getWeatherByAdm4,
} from './bmkg';
import {resolveLocationFromPrompt} from './locations';
import {buildMapMarkers} from './map';
import {
  UNIFIED_ASSISTANT_SYSTEM_PROMPT,
  OPEN_MAP_TOOL,
  GET_WEATHER_TOOL,
  SEARCH_NEWS_TOOL,
  callCloudflareOpenAICompatible
} from './ai';
import {buildNewsQueryFromPrompt, detectNewsTopic, searchNews} from './news';
import {NewsItem, QueryMapData, QueryResponseBody, ToolCard, UiStatus, WorkerEnv, OpenAIMessage} from '../types';

function statusRank(status: UiStatus): number {
  if (status === 'danger') return 3;
  if (status === 'warning') return 2;
  return 1;
}

function toWeatherStatus(weatherDesc: string | null | undefined, precipitationRaw: string | number | null | undefined): UiStatus {
  const description = (weatherDesc || '').toLowerCase();
  const precipitation = typeof precipitationRaw === 'number' ? precipitationRaw : Number(precipitationRaw || 0);
  if (description.includes('lebat') || description.includes('petir') || precipitation >= 5) return 'danger';
  if (description.includes('hujan') || precipitation > 0) return 'warning';
  return 'safe';
}

function flattenWeatherForecast(payload: any): any[] {
  const data = payload?.data;
  if (!Array.isArray(data) || data.length === 0) return [];
  const cuaca = data[0]?.cuaca;
  if (!Array.isArray(cuaca)) return [];
  return cuaca.flatMap((bucket: any) => (Array.isArray(bucket) ? bucket : []));
}

function toSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getDistanceKM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

function getAdaptiveNearbyRadiusKm(zoom: number): number {
  if (zoom <= 6) return 1000; // island-scale query
  if (zoom <= 8) return 700;  // province-scale query
  if (zoom <= 9) return 500;  // metro/regional query
  return 320;                 // city/county query
}

function toNewsQueryKey(query: string, topic: string, locationName: string, limit: number): string {
  return `${query.trim().toLowerCase()}|${topic.trim().toLowerCase()}|${locationName.trim().toLowerCase()}|${limit}`;
}

const DISASTER_NEWS_HINT_REGEX = /\b(gempa|banjir|longsor|cuaca|tsunami|bencana|erupsi|petir|angin|evakuasi|korban|bpbd|bnpb)\b/i;

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function removeUnpairedSurrogates(value: string): string {
  let output = '';

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[i] + value[i + 1];
        i++;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    output += value[i];
  }

  return output;
}

function toAiNewsIntent(
  rawQuery: string,
  rawTopic: string,
  userPrompt: string,
  locationName: string,
): { query: string; topic: string } {
  const location = normalizeInlineText(locationName || '');
  const prompt = normalizeInlineText(userPrompt || '');
  const queryBase = normalizeInlineText(rawQuery || '');
  const topicBase = normalizeInlineText(rawTopic || '');

  const inferredFromCombined = detectNewsTopic(`${topicBase} ${queryBase} ${prompt}`);
  const inferredFromTopic = topicBase ? detectNewsTopic(topicBase) : 'umum';
  let topic = inferredFromTopic !== 'umum' ? inferredFromTopic : inferredFromCombined;

  if (topic === 'umum') {
    topic = 'bencana';
  }

  let query = queryBase;
  if (!query) {
    const fallback = buildNewsQueryFromPrompt(`${prompt} bencana`, location);
    query = fallback.query;
  }

  if (!DISASTER_NEWS_HINT_REGEX.test(query)) {
    query = location && location.toLowerCase() !== 'indonesia'
      ? `bencana ${location}`
      : 'bencana indonesia';
  }

  return {
    query: normalizeInlineText(query),
    topic,
  };
}

function formatNewsForModel(items: NewsItem[]): string {
  return items
    .map((item, index) => {
      const snippet = (item.snippet || item.description || '').slice(0, 140);
      return `${index + 1}. ${item.title} | ${item.source} | ${snippet}\n   URL: ${item.url}`;
    })
    .join('\n');
}

function sanitizeAssistantReplyMarkdown(raw: string): string {
  if (!raw) return '';

  let text = raw.replace(/\r\n/g, '\n');

  text = removeUnpairedSurrogates(text);

  // Drop broken unicode artifacts that may appear when models emit partial emoji/variation tokens.
  text = text.replace(/\uFFFD/g, '');

  // Remove markdown fenced-code lines to avoid rendering whole reply as code block.
  text = text.replace(/^\s*```(?:[a-z0-9_-]+)?\s*$/gim, '');
  text = text.replace(/^\s*```(?:[a-z0-9_-]*)?\n?/i, '');
  text = text.replace(/\n?```+\s*$/i, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

async function executeTool(
  id: string,
  name: string,
  rawArgs: string,
  ctx: ExecutionContext,
  location: any,
  uiTools: ToolCard[],
  setMapView: (center: [number, number], zoom: number) => void,
  getMapData: () => QueryMapData | null,
  setMapData: (data: QueryMapData) => void,
  messages: OpenAIMessage[],
  userPrompt: string,
  newsQueryHistory: Set<string>
) {
  let args: any = {};
  try { args = JSON.parse(rawArgs); } catch {}

  let resultMsg = 'Success';

  if (name === 'open_map') {
      // If the backend already pre-resolved the map from the user's prompt, skip AI's re-resolution
      const existingMapData = getMapData();
      if (existingMapData && existingMapData.center && !isNaN(existingMapData.center[0]) && !isNaN(existingMapData.center[1])) {
        // Map is already pointing correctly from the implicit resolve — don't override
        resultMsg = `System: Map sudah diarahkan ke lokasi yang benar. Tidak perlu re-navigate.`;
      } else {
        const targetLocation = args.locationName ? resolveLocationFromPrompt(args.locationName) : location;
        const lat = targetLocation.center[0];
        const lng = targetLocation.center[1];
        const zoom = targetLocation.zoom;
        
        if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
          const center: [number, number] = [lat, lng];
          setMapView(center, zoom);

          const newMapData: QueryMapData = {
            center,
            zoom,
            highlightArea: targetLocation.provinceName,
            markers: [
              {
                id: `origin-${targetLocation.key}`,
                position: center,
                title: `Wilayah acuan: ${targetLocation.displayName}`,
                status: 'safe',
              }
            ],
            focusPing: center,
          };
          setMapData(newMapData);

          uiTools.push({
            id: `map-${Date.now()}`,
            type: 'map',
            label: 'Map Fokus',
            value: targetLocation.displayName || 'Peta Diperbarui',
            icon: 'navigation',
            status: 'safe',
            description: 'Peta diarahkan sesuai instruksi AI.',
            action: 'map_focus',
            payload: { map: newMapData }
          });

          resultMsg = `System: Map opened pointing at ${targetLocation.displayName} (${lat}, ${lng}) with zoom ${zoom}.`;
        } else {
          resultMsg = `System: Lokasi tidak ditemukan di database. Peta tidak diubah.`;
        }
      }
  }
  else if (name === 'get_weather') {
      const cityName = args.cityName || args.adm4 || '';
      const resolvedTemp = cityName ? resolveLocationFromPrompt(cityName) : location;
      const data = await getWeatherByAdm4(resolvedTemp.adm4, ctx, resolvedTemp.displayName);
      const forecasts = flattenWeatherForecast(data);

      if (forecasts.length > 0) {
          const current = forecasts[0];
          const status = toWeatherStatus(current.weather_desc, current.tp);

          // Build hourly array (up to 6 entries)
          const hourly = forecasts.slice(0, 6).map((f: any) => {
              const dt = f.local_datetime || f.datetime || '';
              const timePart = dt.includes(' ') ? dt.split(' ')[1]?.slice(0, 5) : dt.slice(11, 16);
              return {
                  time: timePart || '--:--',
                  temp: Math.round(Number(f.t || 0)),
                  desc: f.weather_desc || 'N/A',
                  humidity: Math.round(Number(f.hu || 0)),
              };
          });

          uiTools.push({
              id: `weather-${Date.now()}`,
              type: 'weather_widget',
              label: 'Prakiraan Cuaca',
              value: current.weather_desc || 'Tidak diketahui',
              icon: 'cloud-rain',
              status,
              payload: {
                  weather: {
                      locationName: resolvedTemp.displayName !== 'Indonesia' ? resolvedTemp.displayName : (cityName || 'Indonesia'),
                      current: {
                          temp: Math.round(Number(current.t || 0)),
                          desc: current.weather_desc || 'Tidak diketahui',
                          humidity: Math.round(Number(current.hu || 0)),
                          windSpeed: Math.round(Number(current.ws || 0)),
                          windDir: current.wd || '-',
                      },
                      hourly,
                  }
              }
          });
      }
      resultMsg = `System: Widget cuaca 24 jam untuk ${cityName} SUDAH TAMPIL. Cuaca saat ini: ${forecasts[0]?.weather_desc}, ${Math.round(forecasts[0]?.t || 0)}°C. Jawab singkat saja ke user. DILARANG membaca ulang rincian seluruh jam!`;
  }
  else if (name === 'search_news') {
      const resolvedLocationName = typeof args.locationName === 'string' && args.locationName.trim()
        ? args.locationName.trim()
        : location.displayName;
      const fallback = buildNewsQueryFromPrompt(userPrompt, resolvedLocationName);
      const requestedQuery = typeof args.query === 'string' && args.query.trim() ? args.query.trim() : fallback.query;
      const requestedTopic = typeof args.topic === 'string' && args.topic.trim() ? args.topic.trim() : fallback.topic;
      const intent = toAiNewsIntent(requestedQuery, requestedTopic, userPrompt, resolvedLocationName);
      const query = intent.query;
      const topic = intent.topic;
      const limit = Math.max(1, Math.min(Number(args.limit || 3), 3));
      const queryKey = toNewsQueryKey(query, topic, resolvedLocationName, limit);

      if (newsQueryHistory.has(queryKey)) {
        resultMsg = `System: Query berita "${query}" sudah tersedia pada konteks sebelumnya. Gunakan hasil yang ada.`;
      } else {
        newsQueryHistory.add(queryKey);
        const news = await searchNews({
          query,
          topic,
          location: resolvedLocationName,
          limit,
          strict: true,
        }, ctx);

        if (news.items.length > 0) {
          uiTools.push({
            id: `news-${Date.now()}`,
            type: 'news_feed',
            label: 'Berita Terkait',
            value: `${news.items.length} artikel untuk ${news.query}`,
            icon: 'newspaper',
            status: 'safe',
            payload: {
              newsSearch: news,
            }
          });

          resultMsg = `System: Hasil berita untuk "${news.query}" (${news.items.length} item):\n${formatNewsForModel(news.items)}\nGunakan title, description, dan snippet ini untuk jawaban singkat berbasis sumber.`;
        } else {
          resultMsg = `System: Tidak ada berita relevan untuk query "${news.query}".`;
        }
      }
  }
  else {
      resultMsg = `System: Alat ${name} tidak dikenali atau tidak dikonfigurasi.`;
  }

  messages.push({
      role: 'tool',
      content: resultMsg,
      ...( { tool_call_id: id } as any )
  });
}

async function runAiChatLoop(
  prompt: string,
  env: WorkerEnv,
  ctx: ExecutionContext,
  streamWriter?: WritableStreamDefaultWriter<Uint8Array>,
  isSessionStart: boolean = false
): Promise<QueryResponseBody> {
  const encoder = new TextEncoder();
  const location = resolveLocationFromPrompt(prompt);
  const BMKG_TOOLS = [OPEN_MAP_TOOL, GET_WEATHER_TOOL, SEARCH_NEWS_TOOL];
  const newsQueryHistory = new Set<string>();

  let mapCenter = location.center;
  let mapZoom = location.zoom;

  // We only inject minimal Map payload to steer the camera
  let uiMapData: QueryMapData | null = null;
  
  const globalMapData = await buildMapMarkers(ctx);
  const allMarkers = globalMapData.markers;
  const eqCount = allMarkers.filter(m => m.id.startsWith('eq-')).length;
  const nowcastCount = allMarkers.filter(m => m.id.startsWith('nowcast-')).length;

  // Filter markers near the queried location for specific context
  const isSpecificLocation = location.provinceName && location.provinceName !== 'Indonesia';
  let locationContext = '';
  const autoEqCards: ToolCard[] = [];
  const autoNewsCards: ToolCard[] = [];
  const warnings: string[] = [];

  if (isSpecificLocation) {
    const [locLat, locLng] = location.center;
    const nearbyRadiusKm = getAdaptiveNearbyRadiusKm(location.zoom);

    const nearbyMarkers = allMarkers.map(m => {
      const [mLat, mLng] = m.position;
      const distance = getDistanceKM(locLat, locLng, mLat, mLng);
      return { ...m, distance };
    }).filter(m => m.distance <= nearbyRadiusKm);

    const originMarker = {
      id: `origin-${location.key}`,
      position: location.center as [number, number],
      title: `Wilayah acuan: ${location.displayName}`,
      status: 'safe' as UiStatus,
    };
    const mapMarkers = [originMarker, ...nearbyMarkers];

    const nearbyEq = nearbyMarkers
      .filter(m => m.id.startsWith('eq-'))
      .sort((a, b) => a.distance - b.distance);
      
    const nearbyNow = nearbyMarkers.filter(m => m.id.startsWith('nowcast-'));
    const nearestEq = nearbyEq[0];
    const connectionLine = nearestEq
      ? {
          from: location.center as [number, number],
          to: nearestEq.position as [number, number],
          distanceKm: nearestEq.distance,
          label: `${nearestEq.distance} km dari ${location.displayName}`,
        }
      : undefined;
    const fitBounds = nearestEq
      ? ([location.center, nearestEq.position as [number, number]] as [[number, number], [number, number]])
      : undefined;

    const isProvinceQuery = location.zoom <= 9;
    
    if (nearbyEq.length > 0 || nearbyNow.length > 0) {
      const displayLimit = isProvinceQuery ? 10 : 5;
      const eqList = nearbyEq.slice(0, displayLimit).map(m => {
        const magMatch = m.title.match(/M([\d\.]+)/);
        const mag = magMatch ? parseFloat(magMatch[1]) : 0;
        
        let impact = "TIDAK BERPOTENSI";
        if (mag >= 6.0 && m.distance < 400) impact = m.distance < 150 ? "SANGAT BERBAHAYA" : "DIRASAKAN KUAT";
        else if (mag >= 5.0 && m.distance < 300) impact = m.distance < 100 ? "DIRASAKAN KUAT" : "DIRASAKAN LEMAH";
        else if (mag >= 4.0 && m.distance < 150) impact = "DIRASAKAN LEMAH";

        if (isProvinceQuery) {
          return `- ${m.title} | Status: ${impact}.`;
        } else {
          return `- ${m.title} | Jarak: ${m.distance}km ke ${location.displayName}. Dampak: ${impact}.`;
        }
      }).join('\n');
      
      const nowList = nearbyNow.map(m => `- ${m.title}`).join('\n');
      const header = isProvinceQuery 
        ? `[STATUS GEMPA PROVINSI ${location.provinceName.toUpperCase()}]`
        : `[BENCANA DI SEKITAR ${location.displayName.toUpperCase()}]`;

      locationContext = `\n\n${header}:`;
      if (nearbyEq.length > 0) locationContext += `\nGEMPA TERKINI/DIRASAKAN:\n${eqList}`;
      if (nearbyNow.length > 0) locationContext += `\nPERINGATAN CUACA:\n${nowList}`;
      
      const instruction = isProvinceQuery
        ? `\n\n[INSTRUKSI]: Berikan ringkasan status gempa di seluruh provinsi ini. JANGAN sebutkan jarak km.`
        : `\n\n[INSTRUKSI]: Berikan penilaian tegas apakah ${location.displayName} aman atau waspada berdasarkan jarak gempa di atas. Jawab dalam 2 kalimat.`;
      
      locationContext += instruction;
    } else {
      locationContext = `\n\n[STATUS ${location.provinceName.toUpperCase()}]: Wilayah ini AMAN. Tidak ada ancaman bencana terdeteksi dalam radius ${nearbyRadiusKm}km. Tampilkan ketenangan.`;
    }

    // Explicitly set uiMapData so the map automatically pans to this requested location regardless of AI toolcall
    uiMapData = {
        center: location.center,
        zoom: location.zoom,
        highlightArea: location.provinceName,
        markers: mapMarkers,
      focusPing: nearestEq ? nearestEq.position as [number, number] : location.center,
      focusZoom: nearestEq ? 8 : location.zoom,
      fitBounds,
      connectionLine,
    };

    // 1. Unified Status Card (Visible indicator for the requested location)
    const hasDangerEq = nearbyEq.some(m => statusRank(m.status) === 3);
    const hasWarningEq = nearbyEq.some(m => statusRank(m.status) === 2);
    const hasNowcast = nearbyNow.length > 0;
    
    const overallStatus: UiStatus = hasDangerEq ? 'danger' : (hasWarningEq || hasNowcast ? 'warning' : 'safe');
    const statusLabel = overallStatus === 'danger' ? 'BAHAYA' : overallStatus === 'warning' ? 'SIAGA' : 'AMAN';

    autoEqCards.push({
      id: `status-auto-${Date.now()}`,
      type: 'map',
      label: `STATUS ${location.displayName.toUpperCase()}`,
      value: `Wilayah ini dinyatakan: ${statusLabel}`,
      icon: 'navigation',
      status: overallStatus,
      description: nearestEq
        ? 'Klik untuk melihat garis koneksi ke gempa terdekat.'
        : (isProvinceQuery ? 'Klik untuk melihat cakupan provinsi.' : 'Peta difokuskan ke wilayah ini.'),
      action: 'map_focus',
      payload: { map: uiMapData }
    });

    const nearest = nearestEq;
    // 2. Intelligent Auto-Earthquake Card
    if (nearest) {
      const magMatch = nearest.title.match(/M([\d\.]+)/);
      const mag = magMatch ? parseFloat(magMatch[1]) : 0;
      
      // We are more sensitive for province-level status reports
      // (Threat if M>=5.0 anywhere in province or M>=4.0 locally)
      const isThreat = isProvinceQuery 
        ? (mag >= 5.0 || nearest.distance < 200)
        : (mag >= 6.0 && nearest.distance < 300)
          || (mag >= 5.0 && nearest.distance < 200)
          || (mag >= 4.0 && nearest.distance < 100);

      if (isThreat) {
        autoEqCards.push({
          id: nearest.id,
          type: 'earthquake',
          label: isProvinceQuery ? `GEMPA TERDEKAT` : `ANCAMAN TERDEKAT (${nearest.distance} km)`,
          value: nearest.title,
          icon: 'alert-triangle',
          status: nearest.status,
          description: isProvinceQuery ? `Terdeteksi di wilayah ${location.provinceName}.` : `Jarak: ${nearest.distance} km. Berpotensi dirasakan.`,
          action: 'view_earthquake',
          payload: {
            map: {
              center: location.center,
              zoom: location.zoom,
              highlightArea: location.provinceName,
              markers: mapMarkers,
              focusPing: nearest.position as [number, number],
              focusZoom: 8,
              fitBounds,
              connectionLine,
            }
          }
        });
      }
    }
  }

  let initialNewsContext = '';
  if (isSessionStart) {
    try {
      const initialSeed = buildNewsQueryFromPrompt(prompt, location.displayName);
      const initialIntent = toAiNewsIntent(initialSeed.query, initialSeed.topic, prompt, location.displayName);
      const initialNews = await searchNews(
        {
          query: initialIntent.query,
          topic: initialIntent.topic,
          location: location.displayName,
          limit: 3,
          strict: true,
        },
        ctx,
      );

      if (initialNews.items.length > 0) {
        autoNewsCards.push({
          id: `news-initial-${Date.now()}`,
          type: 'news_feed',
          label: 'Berita Awal Sesi',
          value: `${initialNews.items.length} artikel untuk ${initialNews.query}`,
          icon: 'newspaper',
          status: 'safe',
          payload: {
            newsSearch: initialNews,
          },
        });

        newsQueryHistory.add(toNewsQueryKey(initialNews.query, initialIntent.topic, location.displayName, 3));
        initialNewsContext = `\n\n[BERITA TERKAIT AWAL SESI]:\n${formatNewsForModel(initialNews.items)}\n[INSTRUKSI]: Gunakan data ini saat user meminta sumber berita, dan panggil tool search_news jika butuh update terbaru.`;
      }
    } catch (error) {
      warnings.push(error instanceof Error ? `news_prefetch_failed: ${error.message}` : 'news_prefetch_failed');
    }
  }

  const systemContext = `\n\n[CONTEXT GLOBAL]:
Total ${eqCount} gempa + ${nowcastCount} peringatan cuaca aktif di seluruh Indonesia. Semua sudah tampil di peta user.${locationContext}${initialNewsContext}`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: UNIFIED_ASSISTANT_SYSTEM_PROMPT + systemContext },
    { role: 'user', content: prompt }
  ];

  let finalReplyText = '';
  const uiTools: ToolCard[] = [...autoEqCards, ...autoNewsCards];

  const writeStream = async (event: string, data: any) => {
    if (streamWriter) {
      await streamWriter.write(encoder.encode(toSseEvent(event, data)));
    }
  };

  if (streamWriter) {
    await writeStream('start', { ok: true });
  }

  const MAX_LOOPS = 5;
  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const isStreamRequested = !!streamWriter;
    const response = await callCloudflareOpenAICompatible(env, {
      messages,
      tools: BMKG_TOOLS,
      stream: isStreamRequested,
    });

    if (isStreamRequested) {
      if (!(response instanceof Response) || !response.body) {
        throw new Error('Streaming requested but no response body returned');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      let textContent = '';
      const toolCallsAcc: any[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataContent = line.replace('data: ', '').trim();
          if (dataContent === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataContent);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              textContent += delta.content;
              await writeStream('token', { delta: delta.content });
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallsAcc[idx]) {
                  toolCallsAcc[idx] = { id: tc.id, type: 'function', function: { name: tc.function?.name || '', arguments: '' } };
                }
                if (tc.function?.arguments) {
                  toolCallsAcc[idx].function.arguments += tc.function.arguments;
                }
              }
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }

      const validToolCalls = toolCallsAcc.filter(Boolean);

      if (validToolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: sanitizeAssistantReplyMarkdown(textContent),
          ...( { tool_calls: validToolCalls } as any )
        });

        for (const tc of validToolCalls) {
          await executeTool(
            tc.id, tc.function.name, tc.function.arguments,
            ctx, location, uiTools,
            (center, zoom) => { 
                mapCenter = center; 
                mapZoom = zoom; 
                if (uiMapData) { uiMapData.center = center; uiMapData.zoom = zoom; }
            },
            () => uiMapData,
            (data) => { uiMapData = data; },
            messages,
            prompt,
            newsQueryHistory
          );
        }
      } else {
        finalReplyText += textContent;
        break;
      }

    } else {
      // Non-streaming legacy support
      const json = await response;
      const message = json.choices[0].message;
      messages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const tc of message.tool_calls) {
          await executeTool(
            tc.id, tc.function.name, tc.function.arguments,
            ctx, location, uiTools,
            (center, zoom) => { 
                mapCenter = center; 
                mapZoom = zoom; 
                if (uiMapData) { uiMapData.center = center; uiMapData.zoom = zoom; }
            },
            () => uiMapData,
            (data) => { uiMapData = data; },
            messages,
            prompt,
            newsQueryHistory
          );
        }
      } else {
        if (message.content) {
          finalReplyText += message.content;
        }
        break;
      }
    }
  }

  const sanitizedReply = sanitizeAssistantReplyMarkdown(finalReplyText);

  return {
    replyText: sanitizedReply,
    tools: uiTools,
    mapData: uiMapData,
    metadata: {
      generatedAt: new Date().toISOString(),
      warnings,
    } as any, // Typed arbitrarily to drop legacy attribution and location fields cleanly
  };
}

export async function buildQueryResponse(
  prompt: string,
  env: WorkerEnv,
  ctx: ExecutionContext,
  isSessionStart: boolean = false
): Promise<QueryResponseBody> {
  return runAiChatLoop(prompt, env, ctx, undefined, isSessionStart);
}

export function streamQueryResponse(
  prompt: string,
  env: WorkerEnv,
  ctx: ExecutionContext,
  isSessionStart: boolean = false
): Response {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  const run = async () => {
    try {
      const finalPayload = await runAiChatLoop(prompt, env, ctx, writer, isSessionStart);
      await writer.write(new TextEncoder().encode(toSseEvent('done', {
        ok: true,
        data: finalPayload,
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown streaming error.';
      await writer.write(new TextEncoder().encode(toSseEvent('error', {
        ok: false,
        error: message,
      })));
    } finally {
      await writer.close();
    }
  };

  ctx.waitUntil(run());

  return new Response(stream.readable, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
    },
  });
}
