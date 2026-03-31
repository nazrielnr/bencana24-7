import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { apiFetch } from "../lib/api";
import { ApiEnvelope, NewsItem, NewsSearchPayload } from "../types";

interface MapPopupNewsPanelProps {
  markerId: string;
  query: string;
  topic: string;
  locationLabel: string;
}

interface CachedNewsState {
  items: NewsItem[];
  nextCursor?: string;
  total: number;
  generatedAt: string;
}

const POPUP_LIMIT = 5;
const popupNewsCache = new Map<string, CachedNewsState>();

function toCacheKey(markerId: string, query: string, topic: string, locationLabel: string): string {
  return `${markerId}|${query.toLowerCase()}|${topic.toLowerCase()}|${locationLabel.toLowerCase()}`;
}

function formatPublishedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MapPopupNewsPanel({ markerId, query, topic, locationLabel }: MapPopupNewsPanelProps) {
  const cacheKey = useMemo(() => toCacheKey(markerId, query, topic, locationLabel), [markerId, query, topic, locationLabel]);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async (cursor?: string) => {
    if (!query.trim()) {
      setItems([]);
      setNextCursor(undefined);
      setTotal(0);
      return;
    }

    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        q: query,
        topic,
        location: locationLabel,
        limit: String(POPUP_LIMIT),
        strict: "1",
      });
      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await apiFetch(`/api/news/search?${params.toString()}`);
      const payload = (await response.json()) as ApiEnvelope<NewsSearchPayload>;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Gagal memuat berita.");
      }

      const news = payload.data;
      const mergedItems = cursor ? [...items, ...news.items] : news.items;

      setItems(mergedItems);
      setNextCursor(news.nextCursor);
      setTotal(news.total);

      popupNewsCache.set(cacheKey, {
        items: mergedItems,
        nextCursor: news.nextCursor,
        total: news.total,
        generatedAt: news.generatedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat berita.");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [cacheKey, items, locationLabel, query, topic]);

  useEffect(() => {
    const cached = popupNewsCache.get(cacheKey);
    if (cached) {
      setItems(cached.items);
      setNextCursor(cached.nextCursor);
      setTotal(cached.total);
      setError(null);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    void loadNews();
  }, [cacheKey, loadNews]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!nextCursor || isLoading || isLoadingMore) return;

    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom < 56) {
      void loadNews(nextCursor);
    }
  }, [isLoading, isLoadingMore, loadNews, nextCursor]);

  return (
    <div className="w-full sm:w-[280px] sm:border-l border-neutral-200/80 sm:pl-4 flex flex-col mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
      <div className="flex items-center justify-between mb-2 sm:mb-3 shrink-0">
        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-neutral-400 tracking-widest">Related News</span>
        <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400">{total}</span>
      </div>

      <div className="max-h-[135px] sm:max-h-[180px] overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar" onScroll={handleScroll}>
        {isLoading && items.length === 0 && (
          <>
            <div className="h-16 rounded-lg border border-neutral-100 bg-neutral-50/50 animate-pulse" />
            <div className="h-16 rounded-lg border border-neutral-100 bg-neutral-50/50 animate-pulse" />
            <div className="h-16 rounded-lg border border-neutral-100 bg-neutral-50/50 animate-pulse" />
          </>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="text-[11px] font-medium text-neutral-400 text-center py-4">
            Belum ada berita relevan untuk marker ini.
          </div>
        )}

        {error && (
          <div className="text-[11px] text-red-500 bg-red-50/50 border border-red-100 rounded-lg font-medium p-2.5 text-center">
            {error}
          </div>
        )}

        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-2 rounded-lg border border-neutral-200/60 bg-white p-3 hover:border-neutral-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all relative overflow-hidden shrink-0"
          >
            <div className="flex flex-col gap-1.5 min-w-0">
              <h4 
                className="text-[11px] font-bold text-neutral-800 leading-snug group-hover:text-blue-600 transition-colors"
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {item.title}
              </h4>
              <p 
                className="text-[10px] text-neutral-500 leading-relaxed"
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {item.snippet || item.description}
              </p>
            </div>
            
            <div className="flex items-center justify-between pt-2 mt-0.5 border-t border-neutral-100">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-400">
                <span className="truncate max-w-[80px]">{item.source}</span>
                <span className="w-1 h-1 rounded-full bg-neutral-200"></span>
                <span className="font-mono">{formatPublishedAt(item.publishedAt)}</span>
              </div>
              <ExternalLink className="w-3 h-3 text-neutral-300 group-hover:text-blue-500 transition-colors" />
            </div>
          </a>
        ))}

        {isLoadingMore && (
          <div className="h-10 rounded-lg border border-neutral-100 bg-neutral-50/50 animate-pulse mt-1 shrink-0" />
        )}
      </div>
    </div>
  );
}
