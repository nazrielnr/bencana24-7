import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapData } from "../types";
import { AlertTriangle, ShieldCheck, Info, X } from "lucide-react";
import { MapPopupNewsPanel } from "./MapPopupNewsPanel";

// Fix Leaflet default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const createCustomIcon = (status: "safe" | "warning" | "danger") => {
  const color = status === "safe" ? "#10b981" : status === "warning" ? "#f59e0b" : "#ef4444";
  const shadowColor = status === "safe" ? "rgba(16,185,129,0.4)" : status === "warning" ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)";
  
  const pingHtml = status === 'danger' 
    ? `<div class="absolute inset-0 rounded-full animate-ping" style="background-color: ${color}; opacity: 0.75;"></div>` 
    : '';

  return L.divIcon({
    className: "custom-marker bg-transparent border-0",
    html: `
      <div class="relative flex h-4 w-4 items-center justify-center">
        ${pingHtml}
        <div class="relative rounded-full h-3 w-3 border-2 border-white shadow-md z-10" style="background-color: ${color}; box-shadow: 0 0 0 3px ${shadowColor};"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const createOriginIcon = () => {
  return L.divIcon({
    className: "custom-marker bg-transparent border-0",
    html: `
      <div class="relative flex h-6 w-6 items-center justify-center">
        <div class="absolute inset-0 rounded-full" style="background: rgba(37,99,235,0.18);"></div>
        <div class="relative h-3.5 w-3.5 rounded-full border-2 border-white" style="background:#2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.35);"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

/**
 * Dynamic heartbeat size based on zoom level:
 * - zoom 5-6 (island): huge pulse (80px)
 * - zoom 7-8 (province): large pulse (56px)
 * - zoom 9+ (city): compact pulse (36px)
 */
function getHeartbeatSize(zoom: number): number {
  if (zoom <= 6) return 80;
  if (zoom <= 8) return 56;
  return 36;
}

function toCompactLocation(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^pusat gempa berada di\s*/i, "")
    .trim();
}

function toSearchLocation(raw: string): string {
  const compact = toCompactLocation(raw)
    .replace(/\b(pusat|gempa|berada|di|laut|darat|sekitar|wilayah)\b/gi, " ")
    .replace(/\b\d+\s*km\b/gi, " ")
    .replace(/\b(barat|timur|utara|selatan)(daya|laut)?\b/gi, " ")
    .replace(/-/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) return "Indonesia";

  const tokens = compact.split(" ").filter((token) => token.length > 2);
  if (tokens.length === 0) return "Indonesia";
  if (tokens.length > 4) return tokens.slice(-2).join(" ");
  return tokens.join(" ");
}

function buildPopupNewsConfig(markerId: string, markerTitle: string, isEarthquake: boolean, earthquakeLocation: string) {
  const locationLabel = toSearchLocation(earthquakeLocation || markerTitle).slice(0, 100) || "Indonesia";
  const topic = isEarthquake ? "gempa" : markerId.startsWith("nowcast-") ? "cuaca" : "umum";

  const queryBase =
    topic === "gempa"
      ? `gempa ${locationLabel}`
      : topic === "cuaca"
      ? `cuaca ${locationLabel}`
      : markerTitle;

  return {
    topic,
    locationLabel,
    query: queryBase.slice(0, 140),
  };
}

function MapUpdater({
  center,
  zoom,
  fitBounds,
}: {
  center: [number, number];
  zoom: number;
  fitBounds?: [[number, number], [number, number]];
}) {
  const map = useMap();
  const lat = center[0];
  const lng = center[1];
  const b0Lat = fitBounds?.[0]?.[0];
  const b0Lng = fitBounds?.[0]?.[1];
  const b1Lat = fitBounds?.[1]?.[0];
  const b1Lng = fitBounds?.[1]?.[1];

  // Use primitive values as deps so React can properly detect changes
  useEffect(() => {
    const hasFitBounds =
      b0Lat != null &&
      b0Lng != null &&
      b1Lat != null &&
      b1Lng != null &&
      !isNaN(b0Lat) &&
      !isNaN(b0Lng) &&
      !isNaN(b1Lat) &&
      !isNaN(b1Lng);

    if (hasFitBounds) {
      map.fitBounds(
        [
          [b0Lat, b0Lng],
          [b1Lat, b1Lng],
        ],
        {
          animate: true,
          duration: 1.3,
          maxZoom: 11,
          padding: [72, 72],
        },
      );
      return;
    }

    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], zoom, { animate: true, duration: 1.5 });
    }
  }, [lat, lng, zoom, b0Lat, b0Lng, b1Lat, b1Lng, map]);

  useEffect(() => {
    map.invalidateSize();
    const timerId = setTimeout(() => map.invalidateSize(), 300);
    
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    
    return () => {
      clearTimeout(timerId);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

export function MapPanel({ data }: { data: MapData }) {
  const [activePing, setActivePing] = useState<[number, number] | null>(null);
  const [pingZoom, setPingZoom] = useState(8);
  const [showLegend, setShowLegend] = useState(false);
  const lineData = data.connectionLine;
  const hasConnectionLine =
    !!lineData &&
    lineData.from?.length === 2 &&
    lineData.to?.length === 2 &&
    !isNaN(lineData.from[0]) &&
    !isNaN(lineData.from[1]) &&
    !isNaN(lineData.to[0]) &&
    !isNaN(lineData.to[1]);
  const lineLabel = lineData?.label || `${lineData?.distanceKm ?? 0} km`;
  const lineMidpoint: [number, number] | null = hasConnectionLine
    ? [
        (lineData!.from[0] + lineData!.to[0]) / 2,
        (lineData!.from[1] + lineData!.to[1]) / 2,
      ]
    : null;

  let lineAngle = 0;
  if (hasConnectionLine) {
    const p1 = L.CRS.EPSG3857.latLngToPoint(L.latLng(lineData!.from[0], lineData!.from[1]), 0);
    const p2 = L.CRS.EPSG3857.latLngToPoint(L.latLng(lineData!.to[0], lineData!.to[1]), 0);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    lineAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (lineAngle > 90) lineAngle -= 180;
    else if (lineAngle < -90) lineAngle += 180;
  }

  // Heartbeat: show ping for 4s (animated via CSS inside), then unmount
  useEffect(() => {
    if (data.focusPing) {
      setActivePing(data.focusPing);
      setPingZoom(data.focusZoom || data.zoom || 8);
      
      const removeTimer = setTimeout(() => {
        setActivePing(null);
      }, 4000); 
      
      return () => clearTimeout(removeTimer);
    } else {
        const timerRemove = setTimeout(() => {
          setActivePing(null);
        }, 500);
        return () => clearTimeout(timerRemove);
    }
  }, [data.focusPing, data.focusZoom, data.zoom]);

  const legendItems = data.legend || [
    { id: "safe", label: "Aman", status: "safe" as const },
    { id: "warning", label: "Siaga (Peringatan)", status: "warning" as const },
    { id: "danger", label: "Bahaya (Gempa Besar)", status: "danger" as const },
  ];

  const heartbeatSize = getHeartbeatSize(pingZoom);

  return (
    <div className="h-full w-full relative bg-slate-50 overflow-hidden">
      {/* Map Container */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={data.center}
          zoom={data.zoom}
          style={{ height: "100%", width: "100%", background: "#f8fafc", zIndex: 0 }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <MapUpdater center={data.center} zoom={data.zoom} fitBounds={data.fitBounds} />

          {hasConnectionLine && (
            <>
              <Polyline
                positions={[lineData!.from, lineData!.to]}
                pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.92, lineCap: "round" }}
                interactive={false}
              />
              <Polyline
                positions={[lineData!.from, lineData!.to]}
                pathOptions={{ color: "#0f4cdb", weight: 3, opacity: 0.95, lineCap: "round", dashArray: "8, 10" }}
                interactive={false}
              />
              {lineMidpoint && (
                <Marker
                  position={lineMidpoint}
                  interactive={false}
                  icon={L.divIcon({
                    className: "bg-transparent border-0",
                    html: `<div style="position:absolute;left:0;top:0;transform:translate(-50%, -50%) rotate(${lineAngle}deg);transform-origin:center;pointer-events:none;z-index:1000;"><div style="padding:4px 10px;border-radius:999px;border:1px solid rgba(15,76,219,0.25);background:rgba(255,255,255,0.96);color:#0f4cdb;font-weight:700;font-size:11px;line-height:1;box-shadow:0 3px 14px rgba(15,76,219,0.14);white-space:nowrap;backdrop-filter:blur(4px);">${lineLabel}</div></div>`,
                    iconAnchor: [0, 0],
                    iconSize: [0, 0],
                  })}
                />
              )}
            </>
          )}

          {data.markers.map((marker) => {
            const isOrigin = marker.id.startsWith("origin-");

            if (isOrigin) {
              return (
                <Marker
                  key={marker.id}
                  position={marker.position}
                  icon={createOriginIcon()}
                >
                  <Popup closeButton={false} className="!mb-2">
                    <div className="min-w-[220px] max-w-[280px] rounded-lg border border-blue-100 bg-white/95 p-3.5 shadow-[0_4px_16px_rgba(37,99,235,0.1)]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Titik Wilayah</p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900 leading-tight">
                        {marker.title.replace(/^Wilayah acuan:\s*/i, "")}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        Titik ini adalah lokasi acuan dari permintaan user.
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            }

            let isEarthquake = false;
            let mMag = "", mDepth = "", mLoc = "";
            const match = marker.title.match(/(?:Gempa:\s*)?M([\d.]+)\s*\(([^)]+)\)\s*(?:[-:]\s*)?(.*)/i);
            if (match) {
              isEarthquake = true;
              mMag = match[1];
              mDepth = match[2];
              mLoc = match[3];
            }

            const newsConfig = buildPopupNewsConfig(marker.id, marker.title, isEarthquake, mLoc);

            return (
              <Marker
                key={marker.id}
                position={marker.position}
                icon={createCustomIcon(marker.status)}
              >
                <Popup closeButton={false} className="!mb-2">
                  <div className="flex flex-col sm:flex-row min-w-[320px] sm:max-w-[600px] w-full bg-white rounded-lg border border-neutral-200 shadow-[0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden p-4 gap-5 backdrop-blur-sm bg-white/95">    
                    <div className="flex-1 min-w-0 sm:flex-none sm:w-[180px] flex flex-col gap-4">
                      {isEarthquake ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                                Magnitudo
                              </span>
                              <span className="text-sm font-mono font-bold text-neutral-900">
                                M{mMag}
                              </span>
                            </div>
                            <div className="hidden sm:block h-6 w-px bg-neutral-200"></div>     
                            <div className="flex flex-col gap-0.5 sm:items-end">   
                              <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                                Kedalaman
                              </span>
                              <span className="text-sm font-mono font-bold text-neutral-900">
                                {mDepth}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-neutral-700 font-medium leading-relaxed">
                            {mLoc}
                          </p>
                        </>
                      ) : (
                        <h3 className="font-medium text-neutral-900 text-sm leading-tight border-b border-neutral-200 pb-2.5">
                          {marker.title}
                        </h3>
                      )}

                      <div className="flex items-center justify-between mt-auto pt-2.5 sm:pt-3 border-t border-neutral-100">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-neutral-400 tracking-widest">
                          Status Area
                        </span>
                        <span className={`text-[9px] sm:text-[10px] font-mono font-bold px-2 py-0.5 sm:py-1 uppercase tracking-widest rounded-md border ${
                          marker.status === "danger"
                            ? "bg-red-50 text-red-600 border-red-200"
                            : marker.status === "warning"
                            ? "bg-amber-50 text-amber-600 border-amber-200"
                            : "bg-emerald-50 text-emerald-600 border-emerald-200"
                        }`}>
                          {marker.status}
                        </span>
                      </div>
                    </div>

                    <MapPopupNewsPanel
                      markerId={marker.id}
                      query={newsConfig.query}
                      topic={newsConfig.topic}
locationLabel={newsConfig.locationLabel}
                    />
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Dynamic Heartbeat Ping */}
          {activePing && (
            <Marker
              position={activePing}
              icon={L.divIcon({
                className: "custom-marker bg-transparent border-0",
                html: `
                  <style>
                    @keyframes heartbeatFadeInOut {
                      0% { opacity: 0; transform: scale(0.8); }
                      5% { opacity: 1; transform: scale(1); }
                      80% { opacity: 1; }
                      100% { opacity: 0; }
                    }
                  </style>
                  <div class="relative flex items-center justify-center" style="animation: heartbeatFadeInOut 4s forwards; width:${heartbeatSize}px;height:${heartbeatSize}px;">
                    <div class="absolute inset-0 rounded-full animate-ping" style="background-color: rgba(59,130,246,0.35); animation-duration: 1.2s;"></div>
                    <div class="absolute rounded-full" style="width:${heartbeatSize * 0.6}px;height:${heartbeatSize * 0.6}px;background-color: rgba(59,130,246,0.15);"></div>
                    <div class="relative rounded-full border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.6)] z-10" style="width:${heartbeatSize * 0.25}px;height:${heartbeatSize * 0.25}px;background-color: #2563eb; box-shadow: 0 0 0 4px rgba(59,130,246,0.2);"></div>
                  </div>
                `,
                iconSize: [heartbeatSize, heartbeatSize],
                iconAnchor: [heartbeatSize / 2, heartbeatSize / 2],
              })}
            />
          )}
        </MapContainer>

        {/* Legend Overlay */}
        <div className="absolute bottom-[100px] md:bottom-6 left-4 md:left-6 z-[10] flex flex-col items-start gap-2.5">
          {showLegend && (
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-neutral-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Legenda</h4>
                <button
                  type="button"
                  aria-label="Tutup legenda"
                  className="text-neutral-400 hover:text-neutral-700 md:hidden p-1 -mr-1"
                  onClick={() => setShowLegend(false)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2.5">
                {legendItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className={
                      item.status === "safe"
                        ? "w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20"
                        : item.status === "warning"
                        ? "w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-500/20"
                        : "w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20"
                    } />
                    <span className="text-xs font-medium text-slate-700">{item.label}</span>
                  </div>
                ))}
              </div>
              {data.attribution && (
                <p className="text-[10px] text-neutral-400 mt-3 max-w-[160px] leading-snug">{data.attribution}</p>
              )}
            </div>
          )}
          
          <button 
            type="button"
            onClick={() => setShowLegend(!showLegend)}
            className={`flex items-center gap-2 px-3 py-2.5 bg-white/90 backdrop-blur-md rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.06)] border border-neutral-200 text-neutral-600 hover:text-neutral-900 transition-all ${showLegend ? 'bg-white shadow-md' : 'hover:bg-white'}`}
          >
            <Info className="w-4 h-4" />
            <span className="text-xs font-semibold tracking-wide">Info Peta</span>
          </button>
        </div>

        {/* Map Controls Overlay */}
        <div className="absolute top-20 right-6 z-[10] flex flex-col gap-2">
          <button
            type="button"
            aria-label="Filter area aman"
            className="p-2.5 bg-white/80 backdrop-blur-xl rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-slate-200/50"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Filter area peringatan"
            className="p-2.5 bg-white/80 backdrop-blur-xl rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-slate-200/50"
          >
            <AlertTriangle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

