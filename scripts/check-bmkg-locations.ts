import {LOCATIONS, resolveLocationFromPrompt} from '../worker/lib/locations.ts';

const WEATHER_ENDPOINT = 'https://api.bmkg.go.id/publik/prakiraan-cuaca';
const WEATHER_FALLBACKS: Record<string, string[]> = {
  '11.71.01.1001': ['11.71.04.2001'],
};

type LocationEntry = (typeof LOCATIONS)[number];

type WeatherCheckResult = {
  primaryAdm4: string;
  primaryStatus: number | 'error';
  fallbackAdm4: string | null;
  fallbackStatus: number | 'error' | null;
};

function uniqueLocations(entries: LocationEntry[]): LocationEntry[] {
  const seen = new Set<string>();
  const result: LocationEntry[] = [];

  for (const entry of entries) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    result.push(entry);
  }

  return result;
}

function uniqueProbes(entry: LocationEntry): string[] {
  const values = [entry.key, ...entry.aliases].map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set(values));
}

async function fetchStatus(url: string): Promise<number | 'error'> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'siaga-location-audit/1.0',
        Accept: '*/*',
      },
    });

    return response.status;
  } catch {
    return 'error';
  }
}

async function checkWeather(adm4: string): Promise<WeatherCheckResult> {
  const primaryUrl = `${WEATHER_ENDPOINT}?adm4=${encodeURIComponent(adm4)}`;
  const primaryStatus = await fetchStatus(primaryUrl);

  if (primaryStatus === 200 || primaryStatus === 'error') {
    return {
      primaryAdm4: adm4,
      primaryStatus,
      fallbackAdm4: null,
      fallbackStatus: null,
    };
  }

  const fallbacks = WEATHER_FALLBACKS[adm4] || [];
  for (const fallbackAdm4 of fallbacks) {
    const fallbackUrl = `${WEATHER_ENDPOINT}?adm4=${encodeURIComponent(fallbackAdm4)}`;
    const fallbackStatus = await fetchStatus(fallbackUrl);
    if (fallbackStatus === 200) {
      return {
        primaryAdm4: adm4,
        primaryStatus,
        fallbackAdm4,
        fallbackStatus,
      };
    }
  }

  const firstFallback = fallbacks[0] || null;
  const fallbackStatus = firstFallback ? await fetchStatus(`${WEATHER_ENDPOINT}?adm4=${encodeURIComponent(firstFallback)}`) : null;

  return {
    primaryAdm4: adm4,
    primaryStatus,
    fallbackAdm4: firstFallback,
    fallbackStatus,
  };
}

function formatStatus(status: number | 'error' | null): string {
  if (status === null) return '-';
  if (status === 'error') return 'ERROR';
  return String(status);
}

async function main() {
  const entries = uniqueLocations(LOCATIONS);

  console.log(`Location entries: ${entries.length}`);
  console.log('Resolver coverage:');

  const aliasIndex = new Map<string, string[]>();
  for (const entry of entries) {
    for (const probe of uniqueProbes(entry)) {
      const existing = aliasIndex.get(probe) || [];
      existing.push(entry.key);
      aliasIndex.set(probe, existing);
    }
  }

  const resolverMismatches: Array<{probe: string; expected: string; resolved: string}> = [];
  const resolverAmbiguities: Array<{probe: string; expected: string[]; resolved: string}> = [];

  for (const [probe, expectedKeys] of aliasIndex.entries()) {
    const resolved = resolveLocationFromPrompt(probe);
    const uniqueExpectedKeys = Array.from(new Set(expectedKeys));

    if (uniqueExpectedKeys.length > 1) {
      resolverAmbiguities.push({
        probe,
        expected: uniqueExpectedKeys,
        resolved: resolved.key,
      });
      continue;
    }

    if (resolved.key !== uniqueExpectedKeys[0]) {
      resolverMismatches.push({
        probe,
        expected: uniqueExpectedKeys[0],
        resolved: resolved.key,
      });
    }
  }

  console.log(`  Probes checked: ${aliasIndex.size}`);
  console.log(`  Ambiguous aliases: ${resolverAmbiguities.length}`);
  console.log(`  True mismatches: ${resolverMismatches.length}`);

  for (const ambiguity of resolverAmbiguities.slice(0, 10)) {
    console.log(`  AMBIGUOUS - probe="${ambiguity.probe}" expected=[${ambiguity.expected.join(', ')}] resolved="${ambiguity.resolved}"`);
  }

  for (const mismatch of resolverMismatches.slice(0, 10)) {
    console.log(`  MISMATCH - probe="${mismatch.probe}" expected="${mismatch.expected}" resolved="${mismatch.resolved}"`);
  }

  console.log('Weather endpoint coverage:');

  const byAdm4 = new Map<string, LocationEntry[]>();
  for (const entry of entries) {
    const bucket = byAdm4.get(entry.adm4) || [];
    bucket.push(entry);
    byAdm4.set(entry.adm4, bucket);
  }

  const weatherResults: Array<{adm4: string; labels: string; primary: number | 'error'; fallback: number | 'error' | null; fallbackAdm4: string | null}> = [];

  for (const [adm4, group] of byAdm4.entries()) {
    const result = await checkWeather(adm4);
    const labels = group
      .map((entry) => entry.displayName || entry.key)
      .join(', ');

    weatherResults.push({
      adm4: result.primaryAdm4,
      labels,
      primary: result.primaryStatus,
      fallback: result.fallbackStatus,
      fallbackAdm4: result.fallbackAdm4,
    });
  }

  for (const row of weatherResults) {
    const fallbackText = row.fallbackAdm4 ? ` fallback=${row.fallbackAdm4}:${formatStatus(row.fallback)}` : '';
    console.log(`  ${row.adm4} | ${row.labels} | primary=${formatStatus(row.primary)}${fallbackText}`);
  }

  const failed = weatherResults.filter((row) => row.primary !== 200 && row.fallback !== 200);
  const fallbackOnly = weatherResults.filter((row) => row.primary !== 200 && row.fallback === 200);

  console.log(`Summary: ${weatherResults.length} groups checked, ${fallbackOnly.length} recovered by fallback, ${failed.length} still failing.`);
}

await main();