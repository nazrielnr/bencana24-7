import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, CloudRain, Map, ShieldAlert } from "lucide-react";
import { AtmosphereBackground } from "./AtmosphereBackground";
import { DisasterNewsSection } from "./DisasterNewsSection";
import { apiFetch } from "../lib/api";
import { ApiEnvelope, OverviewConditionCard, OverviewResponsePayload } from "../types";

interface HomeProps {
  onSearch: (prompt: string) => void;
  onScroll?: (isScrolled: boolean) => void;
  onPrepareChat?: () => void;
  onSectionChange?: (section: "top" | "conditions" | "news") => void;
  scrollTarget?: "top" | "conditions" | "news" | null;
  onScrollTargetHandled?: () => void;
}

export function Home({ onSearch, onScroll, onPrepareChat, onSectionChange, scrollTarget, onScrollTargetHandled }: HomeProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const conditionsRef = useRef<HTMLDivElement>(null);
  const newsTriggerRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const [cards, setCards] = useState<OverviewConditionCard[]>([]);
  const [attribution, setAttribution] = useState("");
  const [cardsLoading, setCardsLoading] = useState(true);
  const [showNews, setShowNews] = useState(false);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<"top" | "conditions" | "news" | null>(null);

  useEffect(() => {
    let ignore = false;
    let delayedFetchTimer = 0;

    const fetchOverview = async () => {
      try {
        setCardsLoading(true);
        const response = await apiFetch("/api/overview");
        const payload = (await response.json()) as ApiEnvelope<OverviewResponsePayload>;
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || "Failed to fetch overview.");
        }

        if (!ignore) {
          setCards(payload.data.cards || []);
          setAttribution(payload.data.attribution || "");
        }
      } catch {
        if (!ignore) {
          setCards([]);
          setAttribution("Sumber data: BMKG");
        }
      } finally {
        if (!ignore) {
          setCardsLoading(false);
        }
      }
    };

    delayedFetchTimer = window.setTimeout(() => {
      void fetchOverview();
    }, 1200);

    return () => {
      ignore = true;
      window.clearTimeout(delayedFetchTimer);
    };
  }, []);

  useEffect(() => {
    if (showNews) {
      return;
    }

    const root = scrollRootRef.current;
    const target = newsTriggerRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        setShowNews(true);
      },
      {
        root,
        rootMargin: "420px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [showNews]);

  useEffect(() => {
    if (!scrollTarget) {
      return;
    }

    setPendingScrollTarget(scrollTarget);

    if (scrollTarget === "news") {
      setShowNews(true);
    }
  }, [scrollTarget]);

  useLayoutEffect(() => {
    if (!pendingScrollTarget) {
      return;
    }

    if (pendingScrollTarget === "news" && !showNews) {
      return;
    }

    const root = scrollRootRef.current;
    if (!root) {
      return;
    }

    const headerOffset = 88;
    const targetTop =
      pendingScrollTarget === "top"
        ? 0
        : pendingScrollTarget === "conditions"
          ? Math.max(0, (conditionsRef.current?.offsetTop || 0) - headerOffset)
          : Math.max(0, (newsTriggerRef.current?.offsetTop || 0) - headerOffset);

    root.scrollTo({ top: targetTop, behavior: "smooth" });
    onSectionChange?.(pendingScrollTarget);
    onScrollTargetHandled?.();
    setPendingScrollTarget(null);
  }, [onScrollTargetHandled, onSectionChange, pendingScrollTarget, showNews]);

  const updateViewportState = () => {
    const root = scrollRootRef.current;
    if (!root) {
      return;
    }

    const headerOffset = 88;
    const scrollPosition = root.scrollTop + headerOffset;
    const conditionsTop = conditionsRef.current?.offsetTop ?? Number.POSITIVE_INFINITY;
    const newsTop = newsTriggerRef.current?.offsetTop ?? Number.POSITIVE_INFINITY;

    onScroll?.(root.scrollTop > 20);

    if (scrollPosition >= newsTop) {
      onSectionChange?.("news");
    } else if (scrollPosition >= conditionsTop) {
      onSectionChange?.("conditions");
    } else {
      onSectionChange?.("top");
    }
  };

  const triggerSearch = () => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) {
      return;
    }

    onPrepareChat?.();
    onSearch(nextPrompt);
    setPrompt("");
  };

  const suggestions = [
    { icon: <Map className="w-3.5 h-3.5" />, text: "Status bencana di Gorontalo" },
    { icon: <ShieldAlert className="w-3.5 h-3.5" />, text: "Prosedur evakuasi gempa" },
    { icon: <CloudRain className="w-3.5 h-3.5" />, text: "Prakiraan cuaca dan gempa di Bali" },
  ];

  const fallbackCards: OverviewConditionCard[] = [
    {
      id: "fallback-warning",
      title: "Peringatan Dini",
      subtitle: "Indonesia",
      description: "Data peringatan dini sedang dimuat dari BMKG.",
      status: "warning",
      updatedAt: "Memuat...",
    },
    {
      id: "fallback-earthquake",
      title: "Gempa Terkini",
      subtitle: "Indonesia",
      description: "Data gempa sedang dimuat dari BMKG.",
      status: "warning",
      updatedAt: "Memuat...",
    },
    {
      id: "fallback-weather",
      title: "Kondisi Cuaca",
      subtitle: "Indonesia",
      description: "Data cuaca sedang dimuat dari BMKG.",
      status: "safe",
      updatedAt: "Memuat...",
    },
  ];

  const displayCards = cards.length > 0 ? cards.slice(0, 3) : fallbackCards;
  const formatCardDate = (isoString: string) => {
    if (!isoString || isoString.includes("Memuat")) return "MEMUAT...";
    try {
      const normalizedIso = isoString.replace(" ", "T");
      const d = new Date(normalizedIso);
      if (isNaN(d.getTime())) return isoString;
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
      }).format(d).replace(/\./g, ":");
    } catch {
      return isoString;
    }
  };
  const cardIcon = (card: OverviewConditionCard) => {
    if (card.id.includes("earthquake")) return <Activity className="w-5 h-5" />;
    if (card.id.includes("weather")) return <CloudRain className="w-5 h-5" />;
    return <AlertTriangle className="w-5 h-5" />;
  };

  return (
    <div 
      ref={scrollRootRef}
      className="h-full overflow-y-auto hide-scrollbar relative bg-white scroll-pt-20"
      onScroll={updateViewportState}
    >
      <AtmosphereBackground />
      <div className="max-w-5xl mx-auto px-4 relative z-10">
        
        {/* Hero Section - Centered in Viewport */}
        <div className="min-h-[85dvh] flex flex-col justify-center items-center w-full pt-20 pb-10">
          <div className="flex flex-col items-center text-center w-full px-4 sm:px-8 max-w-4xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tighter text-slate-900 mb-5 leading-tight max-w-[800px]">
              Disaster Intelligence & Response
            </h1>
            <p className="text-slate-500 text-base md:text-lg mb-10 max-w-xl leading-relaxed">
              Real-time monitoring, early warnings, and AI-driven insights for disaster management and public safety.
            </p>

            <div
              role="search"
              aria-label="Pencarian kondisi bencana"
              className="w-full relative group mb-8"
            >
              <div className="relative flex items-center bg-white border border-slate-200 rounded-[2rem] overflow-hidden transition-all duration-300 focus-within:border-slate-300 focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)] shadow-[0_2px_10px_rgba(0,0,0,0.02)] pl-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => onPrepareChat?.()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      triggerSearch();
                    }
                  }}
                  placeholder="Ask about any location, disaster, or weather..."
                  className="w-full py-4.5 px-6 text-[17px] bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400"
                  autoFocus
                />
                <button
                  type="button"
                  aria-label="Mulai pencarian"
                  disabled={!prompt.trim()}
                  onClick={triggerSearch}
                  className="mr-2.5 p-3 bg-slate-900 text-white rounded-[1.5rem] disabled:opacity-30 disabled:bg-slate-100 disabled:text-slate-400 transition-all hover:bg-slate-800"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2.5 w-full">
              {suggestions.map((suggestion, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    onPrepareChat?.();
                    onSearch(suggestion.text);
                  }}
                  className="flex items-center gap-2.5 px-4 py-2 bg-white border border-slate-200/80 rounded-full text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-md"
                >
                  <span className="text-slate-400">{suggestion.icon}</span>
                  <span className="font-medium">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 2: Real-time conditions */}
        <div ref={conditionsRef} className="pb-32 w-full max-w-4xl mx-auto scroll-mt-20">
            <div className="flex items-center justify-between mb-6 px-1">
              <h2 className="text-base font-semibold text-neutral-900 tracking-tight">Real-time Conditions</h2>
            <button
              type="button"
              onClick={() => {
                onPrepareChat?.();
                onSearch("Status bencana nasional hari ini");
              }}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View Map
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayCards.map((card) => (
              <div key={card.id} className="w-full flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-[0_4px_24px_rgba(0,0,0,0.06)] group">
                <div className="flex items-center justify-between border-b border-neutral-100 p-3 bg-neutral-50/50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex items-center justify-center w-7 h-7 rounded-md border ${
                      card.status === "danger" ? "bg-red-50 text-red-600 border-red-200/60" :
                      card.status === "warning" ? "bg-amber-50 text-amber-600 border-amber-200/60" :
                      "bg-emerald-50 text-emerald-600 border-emerald-200/60"
                    }`}>
                      {cardIcon(card)}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 truncate">
                      {card.status === "danger" ? "BAHAYA" : card.status === "warning" ? "SIAGA" : "AMAN"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-medium text-neutral-400 whitespace-nowrap ml-2">
                    {cardsLoading ? "UPDATING..." : formatCardDate(card.updatedAt)}
                  </span>
                </div>
                
                <div className="p-4 flex flex-col gap-3.5 flex-1">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-[14px] font-bold text-neutral-900 leading-snug tracking-tight">
                      {card.title}
                    </h3>
                    <p className="text-xs text-neutral-500 font-medium tracking-tight break-words line-clamp-2">
                      {card.subtitle}
                    </p>
                  </div>
                  <div className="h-px w-full bg-neutral-100 mt-0.5"></div>
                  <p className="text-[13px] text-neutral-600 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {attribution && (
            <p className="mt-4 text-xs text-slate-400">{attribution}</p>
          )}
        </div>

          {/* Section 3: Disaster News Stream */}
          <div ref={newsTriggerRef} className="h-px w-full scroll-mt-20" />
          {showNews ? (
            <DisasterNewsSection scrollRootRef={scrollRootRef} />
          ) : (
            <div className="pb-20 text-center text-xs text-slate-400">Scroll ke bawah untuk memuat feed berita terbaru.</div>
          )}
      </div>
    </div>
  );
}
