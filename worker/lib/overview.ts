import {
  getAutoGempa,
  getBmkgAttribution,
  getNowcastDetail,
  getNowcastFeed,
  getWeatherByAdm4,
} from './bmkg';
import {OverviewConditionCard, OverviewResponseBody, UiStatus} from '../types';

const DEFAULT_ADM4 = '31.71.03.1001';

function toEarthquakeStatus(magnitudeRaw: string | number | null | undefined): UiStatus {
  const magnitude = typeof magnitudeRaw === 'number' ? magnitudeRaw : Number(magnitudeRaw || 0);
  if (magnitude >= 6) return 'danger';
  if (magnitude >= 5) return 'warning';
  return 'safe';
}

function toWeatherStatus(weatherDesc: string | null | undefined, precipitationRaw: string | number | null | undefined): UiStatus {
  const description = (weatherDesc || '').toLowerCase();
  const precipitation = typeof precipitationRaw === 'number' ? precipitationRaw : Number(precipitationRaw || 0);

  if (description.includes('lebat') || description.includes('petir') || precipitation >= 5) {
    return 'danger';
  }

  if (description.includes('hujan') || precipitation > 0) {
    return 'warning';
  }

  return 'safe';
}

function toNowcastStatus(severity: string | null | undefined, urgency: string | null | undefined): UiStatus {
  const severityValue = (severity || '').toLowerCase();
  const urgencyValue = (urgency || '').toLowerCase();

  if (severityValue.includes('severe') || severityValue.includes('extreme')) {
    return 'danger';
  }

  if (severityValue.includes('moderate') || urgencyValue.includes('immediate') || urgencyValue.includes('expected')) {
    return 'warning';
  }

  return 'safe';
}

function flattenWeatherForecast(payload: any): any[] {
  const data = payload?.data;
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const cuaca = data[0]?.cuaca;
  if (!Array.isArray(cuaca)) {
    return [];
  }

  return cuaca.flatMap((bucket: any) => (Array.isArray(bucket) ? bucket : []));
}

function extractNowcastCode(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = link.match(/\/([A-Za-z0-9]+)_alert\.xml$/);
  return match?.[1] || null;
}

function clipText(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

export async function buildOverviewResponse(ctx: ExecutionContext): Promise<OverviewResponseBody> {
  const [weatherPayload, autoGempaPayload, nowcastFeedPayload] = await Promise.all([
    getWeatherByAdm4(DEFAULT_ADM4, ctx, 'DKI Jakarta'),
    getAutoGempa(ctx),
    getNowcastFeed('id', ctx),
  ]);

  const generatedAt = new Date().toISOString();
  const attribution = getBmkgAttribution();

  const forecast = flattenWeatherForecast(weatherPayload);
  const nextForecast = forecast[0] || null;

  const weatherCard: OverviewConditionCard = {
    id: 'weather',
    title: nextForecast?.weather_desc || 'Kondisi Cuaca',
    subtitle: weatherPayload?.lokasi?.provinsi || 'Indonesia',
    description: nextForecast
      ? `Suhu ${nextForecast?.t ?? '-'} C, kelembapan ${nextForecast?.hu ?? '-'}%, angin ${nextForecast?.ws ?? '-'} km/jam.`
      : 'Data prakiraan cuaca belum tersedia.',
    status: toWeatherStatus(nextForecast?.weather_desc, nextForecast?.tp),
    updatedAt: nextForecast?.local_datetime || generatedAt,
  };

  const latestGempa = autoGempaPayload?.Infogempa?.gempa || null;
  const latestMagnitude = latestGempa?.Magnitude || 0;
  const earthquakeCard: OverviewConditionCard = {
    id: 'earthquake',
    title: latestGempa ? `Gempa M ${latestMagnitude}` : 'Gempa Terkini',
    subtitle: latestGempa?.Wilayah || 'Indonesia',
    description: latestGempa
      ? `Kedalaman ${latestGempa?.Kedalaman || '-'}, potensi: ${latestGempa?.Potensi || 'tidak tersedia'}.`
      : 'Data gempa terbaru belum tersedia.',
    status: toEarthquakeStatus(latestMagnitude),
    updatedAt: latestGempa?.DateTime || generatedAt,
  };

  const firstNowcastItem = Array.isArray(nowcastFeedPayload?.items) ? nowcastFeedPayload.items[0] : null;
  const nowcastCode = extractNowcastCode(firstNowcastItem?.link);
  let nowcastDetail: any = null;

  if (nowcastCode) {
    try {
      nowcastDetail = await getNowcastDetail('id', nowcastCode, ctx);
    } catch {
      nowcastDetail = null;
    }
  }

  const warningCard: OverviewConditionCard = {
    id: 'warning',
    title: nowcastDetail?.headline || firstNowcastItem?.title || 'Peringatan Dini Cuaca',
    subtitle: nowcastDetail?.areas?.[0]?.areaDesc || 'Indonesia',
    description: clipText(nowcastDetail?.description || firstNowcastItem?.description || 'Belum ada peringatan dini aktif.'),
    status: toNowcastStatus(nowcastDetail?.severity, nowcastDetail?.urgency),
    updatedAt: nowcastDetail?.effective || firstNowcastItem?.pubDate || generatedAt,
  };

  return {
    cards: [warningCard, earthquakeCard, weatherCard],
    attribution,
    generatedAt,
  };
}
