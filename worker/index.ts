import {callCloudflareOpenAICompatible} from './lib/ai';
import {
  getAutoGempa,
  getGempaDirasakan,
  getGempaTerkini,
  getNowcastDetail,
  getNowcastFeed,
  getWeatherByAdm4,
} from './lib/bmkg';
import {errorResponse, jsonResponse, optionsResponse, readJsonBody, withOk} from './lib/http';
import {buildOverviewResponse} from './lib/overview';
import {buildQueryResponse, streamQueryResponse} from './lib/query';
import {buildMapMarkers} from './lib/map';
import {searchNews} from './lib/news';
import {OpenAIChatCompletionRequest, QueryRequestBody, WorkerEnv} from './types';

function getLang(value: string | null): 'id' | 'en' {
  return value === 'en' ? 'en' : 'id';
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return optionsResponse();
    }

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return jsonResponse(withOk({
          service: 'siaga-worker',
          status: 'ok',
          timestamp: new Date().toISOString(),
        }));
      }

      if (request.method === 'GET' && url.pathname === '/api/overview') {
        const payload = await buildOverviewResponse(ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/map/markers') {
        const payload = await buildMapMarkers(ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/news/search') {
        const query = (url.searchParams.get('q') || '').trim();
        const topic = (url.searchParams.get('topic') || '').trim();
        const location = (url.searchParams.get('location') || '').trim();
        const limitRaw = url.searchParams.get('limit');
        const cursor = (url.searchParams.get('cursor') || '').trim();
        const strictRaw = (url.searchParams.get('strict') || '').trim().toLowerCase();
        const strict = strictRaw === '1' || strictRaw === 'true';

        if (!query && !topic) {
          return errorResponse('Query parameter q or topic is required.', 400);
        }

        const payload = await searchNews(
          {
            query,
            topic: topic || undefined,
            location: location || undefined,
            limit: limitRaw ? Number(limitRaw) : 5,
            cursor: cursor || undefined,
            strict,
          },
          ctx,
        );

        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/bmkg/weather') {
        const adm4 = url.searchParams.get('adm4');
        const location = url.searchParams.get('location') || undefined;
        if (!adm4) {
          return errorResponse('Query parameter adm4 is required.', 400);
        }

        const payload = await getWeatherByAdm4(adm4, ctx, location || undefined);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/bmkg/earthquake/latest') {
        const payload = await getAutoGempa(ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/bmkg/earthquake/recent') {
        const payload = await getGempaTerkini(ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/bmkg/earthquake/felt') {
        const payload = await getGempaDirasakan(ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/bmkg/nowcast/feed') {
        const lang = getLang(url.searchParams.get('lang'));
        const payload = await getNowcastFeed(lang, ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'GET' && url.pathname === '/api/bmkg/nowcast/detail') {
        const code = url.searchParams.get('code');
        if (!code) {
          return errorResponse('Query parameter code is required.', 400);
        }

        const lang = getLang(url.searchParams.get('lang'));
        const payload = await getNowcastDetail(lang, code, ctx);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'POST' && url.pathname === '/api/ai/chat/completions') {
        const body = await readJsonBody<OpenAIChatCompletionRequest>(request);
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return errorResponse('messages array is required.', 400);
        }

        const completion = await callCloudflareOpenAICompatible(env, body);
        return jsonResponse(completion);
      }

      if (request.method === 'POST' && url.pathname === '/api/query') {
        const body = await readJsonBody<QueryRequestBody>(request);
        if (!body.prompt || !body.prompt.trim()) {
          return errorResponse('prompt is required.', 400);
        }

        const payload = await buildQueryResponse(body.prompt, env, ctx, !!body.isSessionStart);
        return jsonResponse(withOk(payload));
      }

      if (request.method === 'POST' && url.pathname === '/api/query/stream') {
        const body = await readJsonBody<QueryRequestBody>(request);
        if (!body.prompt || !body.prompt.trim()) {
          return errorResponse('prompt is required.', 400);
        }

        return streamQueryResponse(body.prompt, env, ctx, !!body.isSessionStart);
      }

      return errorResponse('Endpoint not found.', 404);
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse('Request failed.', 500, details);
    }
  },
};
