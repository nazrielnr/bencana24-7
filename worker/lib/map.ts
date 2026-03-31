import { getAutoGempa, getGempaDirasakan, getGempaTerkini, getNowcastFeed, getBmkgAttribution } from "./bmkg";
import { resolveLocationFromPrompt } from "./locations";
import { MapMarker, UiStatus } from "../types";

function toEarthquakeStatus(magnitudeRaw: string | number | null | undefined): UiStatus {
  const magnitude = typeof magnitudeRaw === 'number' ? magnitudeRaw : Number(magnitudeRaw || 0);
  if (magnitude >= 6) return 'danger';
  if (magnitude >= 5) return 'warning';
  return 'safe';
}

export async function buildMapMarkers(ctx: ExecutionContext) {
  const [
    autoGempaPayload,
    gempaterkiniPayload,
    gempadirasakanPayload,
    nowcastFeedPayload
  ] = await Promise.all([
    getAutoGempa(ctx),
    getGempaTerkini(ctx),
    getGempaDirasakan(ctx),
    getNowcastFeed('id', ctx)
  ]);

  const markers: MapMarker[] = [];
  const legendMap = new Map<string, { id: string, label: string, status: UiStatus }>();
  let hasDanger = false;
  let hasWarning = false;

  const eqIds = new Set<string>();

  const processEarthquake = (eqRaw: any, isGlobal: boolean = false) => {
    if (!eqRaw?.Coordinates) return;
    const parts = eqRaw.Coordinates.split(',');
    if (parts.length !== 2) return;
    
    // Hash-like ID based on coord and date to prevent dupes
    const eqId = `${eqRaw.DateTime}-${eqRaw.Coordinates}`;
    if (eqIds.has(eqId)) return;
    eqIds.add(eqId);

    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    const mag = parseFloat(eqRaw.Magnitude || '0');
    const depth = eqRaw.Kedalaman || '';
    const wilayah = eqRaw.Wilayah || '';

    const status = toEarthquakeStatus(mag);
    if (status === 'danger') hasDanger = true;
    if (status === 'warning') hasWarning = true;

    markers.push({
      id: `eq-${eqId}`,
      position: [lat, lng],
      title: `Gempa: M${mag} (${depth}) - ${wilayah}`,
      status
    });
  };

  // 1. Auto Gempa (1 latest)
  if (autoGempaPayload?.Infogempa?.gempa) {
    processEarthquake(autoGempaPayload.Infogempa.gempa, true);
  }

  // 2. Gempa Terkini (15 M5.0+)
  const gempaTerkiniList = gempaterkiniPayload?.Infogempa?.gempa;
  if (Array.isArray(gempaTerkiniList)) {
    gempaTerkiniList.forEach((eq) => processEarthquake(eq));
  } else if (gempaTerkiniList) {
    processEarthquake(gempaTerkiniList);
  }

  // 3. Gempa Dirasakan (15 felt)
  const gempaDirasakanList = gempadirasakanPayload?.Infogempa?.gempa;
  if (Array.isArray(gempaDirasakanList)) {
    gempaDirasakanList.forEach((eq) => processEarthquake(eq));
  } else if (gempaDirasakanList) {
    processEarthquake(gempaDirasakanList);
  }

  // 4. Nowcasts (Weather warnings)
  const nowcastItems = nowcastFeedPayload?.items || [];
  for (let i = 0; i < nowcastItems.length; i++) {
    const item = nowcastItems[i];
    const title = String(item?.title || '');
    
    // Resolve area to coordinate directly from the text
    const itemLoc = resolveLocationFromPrompt(title);
    
    // Default location resolver fallback is 'DKI Jakarta', so if we get exactly DKI Jakarta back, 
    // we should only plot it if the title ACTUALLY says Jakarta, otherwise ignore to prevent clustering.
    const isActuallyJakarta = title.toLowerCase().includes('jakarta');
    if (itemLoc.provinceName === 'DKI Jakarta' && !isActuallyJakarta) {
       continue;
    }

    // Now plot the resolved location coordinate
    if (itemLoc.provinceName !== 'Indonesia') {
        hasWarning = true;
        markers.push({
            id: `nowcast-${i}`,
            position: itemLoc.center,
            title: title.slice(0, 70) + (title.length > 70 ? '...' : ''),
            status: 'warning'
        });
    }
  }

  // Default Legend
  legendMap.set('safe', { id: 'safe', label: 'Aman', status: 'safe' });
  
  if (hasWarning) {
    legendMap.set('warning', { id: 'warning', label: 'Siaga (Peringatan)', status: 'warning' });
  }
  if (hasDanger) {
    legendMap.set('danger', { id: 'danger', label: 'Bahaya (Gempa Besar)', status: 'danger' });
  }

  return {
    markers,
    legend: Array.from(legendMap.values()),
    attribution: getBmkgAttribution(),
    generatedAt: new Date().toISOString()
  };
}
