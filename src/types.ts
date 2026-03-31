export type Role = "user" | "ai";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  tools?: ToolCall[];
}

export type ToolType = string;

export type UiStatus = "safe" | "warning" | "danger";

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
  image?: string;
}

export interface NewsSearchPayload {
  query: string;
  topic?: string;
  location?: string;
  total: number;
  nextCursor?: string;
  items: NewsItem[];
  generatedAt: string;
}

export interface MapMarker {
  id: string;
  position: [number, number];
  title: string;
  status: UiStatus;
}

export interface MapConnectionLine {
  from: [number, number];
  to: [number, number];
  distanceKm: number;
  label?: string;
}

export interface ToolMapPayload {
  center?: [number, number];
  zoom?: number;
  highlightArea?: string;
  markers?: MapMarker[];
  focusPing?: [number, number];
  focusZoom?: number;
  fitBounds?: [[number, number], [number, number]];
  connectionLine?: MapConnectionLine;
}

export interface ToolCall {
  id: string;
  type: ToolType;
  label: string;
  value: string;
  icon?: string;
  status?: UiStatus;
  description?: string;
  action?: string;
  payload?: {
    map?: ToolMapPayload;
    weather?: WeatherWidgetPayload;
    newsSearch?: NewsSearchPayload;
    [key: string]: unknown;
  };
}

export interface WeatherHourly {
  time: string;
  temp: number;
  desc: string;
  humidity: number;
}

export interface WeatherWidgetPayload {
  locationName: string;
  current: {
    temp: number;
    desc: string;
    humidity: number;
    windSpeed: number;
    windDir: string;
  };
  hourly: WeatherHourly[];
}

export interface MapData {
  center: [number, number];
  zoom: number;
  highlightArea?: string;
  attribution?: string;
  legend?: {
    id: string;
    label: string;
    status: UiStatus;
    description?: string;
  }[];
  markers: MapMarker[];
  focusPing?: [number, number];
  focusZoom?: number;
  fitBounds?: [[number, number], [number, number]];
  connectionLine?: MapConnectionLine;
}

export interface MapMarkersPayload {
  markers: MapMarker[];
  legend?: {
    id: string;
    label: string;
    status: UiStatus;
    description?: string;
  }[];
  attribution?: string;
  generatedAt?: string;
}

export interface QueryResponsePayload {
  replyText: string;
  tools: ToolCall[];
  mapData: MapData | null;
  metadata: {
    location: string;
    attribution: string;
    generatedAt: string;
    warnings: string[];
  };
}

export interface OverviewConditionCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  status: UiStatus;
  updatedAt: string;
}

export interface OverviewResponsePayload {
  cards: OverviewConditionCard[];
  attribution: string;
  generatedAt: string;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}
