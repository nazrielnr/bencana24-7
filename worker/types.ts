export interface WorkerEnv {
  ASSETS: Fetcher;
  AI?: {
    run: (model: string, input: unknown) => Promise<unknown>;
  };
  AI_MODEL?: string;
  OPENAI_COMPAT_BASE_URL?: string;
  OPENAI_COMPAT_API_KEY?: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_NAME?: string;
}

export interface OpenAIMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface OpenAIChatCompletionRequest {
  model?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
}

export interface QueryRequestBody {
  prompt: string;
  isSessionStart?: boolean;
}

export type UiStatus = 'safe' | 'warning' | 'danger';

export interface ToolCard {
  id: string;
  type: string;
  label: string;
  value: string;
  icon?: string;
  status?: UiStatus;
  description?: string;
  action?: string;
  payload?: {
    map?: {
      center?: [number, number];
      zoom?: number;
      highlightArea?: string;
      markers?: MapMarker[];
      focusPing?: [number, number];
      focusZoom?: number;
      fitBounds?: [[number, number], [number, number]];
      connectionLine?: MapConnectionLine;
    };
    [key: string]: unknown;
  };
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

export interface NewsSearchRequest {
  query: string;
  topic?: string;
  location?: string;
  limit?: number;
  cursor?: string;
  strict?: boolean;
}

export interface NewsSearchResponse {
  query: string;
  topic?: string;
  location?: string;
  total: number;
  nextCursor?: string;
  items: NewsItem[];
  generatedAt: string;
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

export interface QueryMapData {
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

export interface QueryResponseBody {
  replyText: string;
  tools: ToolCard[];
  mapData: QueryMapData | null;
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

export interface OverviewResponseBody {
  cards: OverviewConditionCard[];
  attribution: string;
  generatedAt: string;
}

export interface LocationConfig {
  key: string;
  aliases: string[];
  adm4: string;
  provinceName: string;
  displayName: string;
  center: [number, number];
  zoom: number;
}
