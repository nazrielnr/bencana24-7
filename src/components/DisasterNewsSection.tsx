import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, CalendarDays, Newspaper } from "lucide-react";
import { apiFetch } from "../lib/api";
import { ApiEnvelope, NewsItem, NewsSearchPayload } from "../types";

interface DisasterNewsSectionProps {
  scrollRootRef: RefObject<HTMLDivElement | null>;
}

interface CachedFeedState {
  items: NewsItem[];
  nextCursor?: string;
  total: number;
  generatedAt: string;
}

const DISASTER_NEWS_QUERY = "bencana alam gempa banjir longsor cuaca ekstrem tsunami indonesia";
const PAGE_LIMIT = 9;
const newsCache = new Map<string, CachedFeedState>();

function formatPublishedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Baru saja";
  }

  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function splitIntoLines(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxChars || current.length === 0) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) {
      const remaining = [current, ...words.slice(index + 1)].join(" ");
      lines.push(clampText(remaining, maxChars));
      return lines.slice(0, maxLines);
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  return lines;
}

function buildFallbackCover(item: NewsItem): string {
  const title = splitIntoLines(item.title, 28, 3);
  const source = clampText(item.source.toUpperCase(), 24);
  const publishedAt = formatPublishedAt(item.publishedAt);

  const titleLines = title
    .map((line, index) => `<tspan x="52" dy="${index === 0 ? 0 : 54}">${escapeXml(line)}</tspan>`)
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="52%" stop-color="#111827" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
        <filter id="blur">
          <feGaussianBlur stdDeviation="45" />
        </filter>
      </defs>
      <rect width="1200" height="760" fill="url(#bg)" />
      <circle cx="140" cy="110" r="130" fill="#38bdf8" opacity="0.12" filter="url(#blur)" />
      <circle cx="1030" cy="120" r="180" fill="#f59e0b" opacity="0.10" filter="url(#blur)" />
      <circle cx="980" cy="630" r="210" fill="#38bdf8" opacity="0.08" filter="url(#blur)" />
      <rect x="48" y="52" width="126" height="34" rx="17" fill="rgba(255,255,255,0.10)" />
      <text x="66" y="75" fill="#e2e8f0" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="2">NEWS</text>
      <rect x="48" y="122" width="220" height="8" rx="4" fill="url(#accent)" opacity="0.9" />
      <text x="52" y="210" fill="#f8fafc" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="44" font-weight="800" letter-spacing="-0.5">${titleLines}</text>
      <text x="52" y="560" fill="#cbd5e1" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="0.4">${escapeXml(source)}</text>
      <text x="52" y="604" fill="#94a3b8" font-family="JetBrains Mono, monospace" font-size="18" font-weight="500">${escapeXml(publishedAt)}</text>
      <rect x="48" y="650" width="310" height="54" rx="27" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.12)" />
      <text x="80" y="684" fill="#f8fafc" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="18" font-weight="700">News</text>
      <circle cx="347" cy="677" r="7" fill="#38bdf8" />
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getCoverSrc(item: NewsItem): string {
  if (item.image && !item.image.includes("google.com/s2/favicons")) {
    return item.image;
  }

  return buildFallbackCover(item);
}

export function DisasterNewsSection({ scrollRootRef }: DisasterNewsSectionProps) {
  const cacheKey = useMemo(() => DISASTER_NEWS_QUERY.toLowerCase(), []);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestInFlightRef = useRef(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async (cursor?: string) => {
    if (requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;

    if (cursor) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const params = new URLSearchParams({
        q: DISASTER_NEWS_QUERY,
        limit: String(PAGE_LIMIT),
        strict: "0",
      });

      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await apiFetch(`/api/news/search?${params.toString()}`);
      const payload = (await response.json()) as ApiEnvelope<NewsSearchPayload>;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Gagal memuat news.");
      }

      const news = payload.data;
      let mergedItems = news.items;

      setItems((previous) => {
        mergedItems = cursor ? [...previous, ...news.items] : news.items;
        return mergedItems;
      });
      setNextCursor(news.nextCursor);
      setTotal(news.total);

      newsCache.set(cacheKey, {
        items: mergedItems,
        nextCursor: news.nextCursor,
        total: news.total,
        generatedAt: news.generatedAt,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat news.");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      requestInFlightRef.current = false;
    }
  }, [cacheKey]);

  useEffect(() => {
    const cached = newsCache.get(cacheKey);
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

  useEffect(() => {
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!nextCursor || isLoading || isLoadingMore) return;
        void loadNews(nextCursor);
      },
      {
        root,
        rootMargin: "320px 0px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoading, isLoadingMore, loadNews, nextCursor, scrollRootRef]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="pb-28 w-full max-w-4xl mx-auto"
    >
      <div className="flex items-end justify-between gap-4 mb-6 px-1">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-neutral-900 tracking-tight">
            News
          </h2>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 text-right">
          <span className="text-[10px] uppercase tracking-[0.26em] text-slate-400 font-semibold">Live Feed</span>
          <span className="text-sm font-semibold text-slate-900">{total.toLocaleString("id-ID")} berita</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && items.length === 0 && Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm animate-pulse">
            <div className="h-44 bg-neutral-100" />
            <div className="p-4 space-y-3">
              <div className="h-3.5 w-20 rounded-full bg-neutral-100" />
              <div className="h-4 w-5/6 rounded bg-neutral-100" />
              <div className="h-4 w-4/5 rounded bg-neutral-100" />
              <div className="h-3 w-full rounded bg-neutral-100" />
              <div className="h-3 w-2/3 rounded bg-neutral-100" />
            </div>
          </div>
        ))}

        {!isLoading && error && items.length === 0 && (
          <div className="col-span-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {items.map((item, index) => (
          <motion.a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: Math.min(index % 6, 5) * 0.04 }}
            className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-[0_6px_30px_rgba(0,0,0,0.07)]"
          >
            <div className="relative bg-neutral-100 aspect-[16/10] overflow-hidden">
              <img
                src={getCoverSrc(item)}
                alt={item.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-sm">
                <Newspaper className="w-3 h-3" />
                News
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 text-white">
                <span className="truncate text-[11px] font-medium text-white/80">{item.source}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-mono text-white/90 backdrop-blur-sm">
                  <CalendarDays className="w-3 h-3" />
                  {formatPublishedAt(item.publishedAt)}
                </span>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <h3
                className="text-[15px] font-bold text-neutral-900 leading-snug tracking-tight group-hover:text-slate-700"
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {item.title}
              </h3>

              <p
                className="text-[13px] text-neutral-600 leading-relaxed"
                style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {item.snippet || item.description}
              </p>

              <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-400">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-medium text-neutral-500">
                  {item.source}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-slate-500 group-hover:text-slate-700">
                  Buka detail
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </motion.a>
        ))}
      </div>

      <div ref={sentinelRef} className="h-10" />

      {isLoadingMore && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-400 animate-pulse" />
          Memuat berita lanjutan...
        </div>
      )}

      {!isLoading && !isLoadingMore && items.length > 0 && !nextCursor && (
        <div className="mt-2 text-center text-xs text-slate-400">
          Feed sudah mencapai berita paling baru.
        </div>
      )}
    </motion.section>
  );
}