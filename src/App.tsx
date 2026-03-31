import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Map as MapIcon, MessageSquare } from "lucide-react";
import { Home } from "./components/Home";
import { Header } from "./components/Header";
import { apiFetch } from "./lib/api";
import { ApiEnvelope, ChatMessage, MapData, MapMarkersPayload, QueryResponsePayload, ToolCall } from "./types";

const DEFAULT_MAP_CENTER: [number, number] = [-2.5489, 118.0149];
const DEFAULT_MAP_ZOOM = 5;

const loadChatCanvas = () => import("./components/ChatCanvas");

const ChatCanvas = lazy(() =>
  loadChatCanvas().then((module) => ({ default: module.ChatCanvas })),
);

const MapPanel = lazy(() =>
  import("./components/MapPanel").then((module) => ({ default: module.MapPanel })),
);

function PanelFallback() {
  return (
    <div className="h-full w-full bg-white" aria-hidden />
  );
}

export default function App() {
  const [view, setView] = useState<"home" | "chat">("home");
  const [homeScrollTarget, setHomeScrollTarget] = useState<"top" | "conditions" | "news" | null>(null);
  const [activeHomeSection, setActiveHomeSection] = useState<"top" | "conditions" | "news">("top");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>({
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    markers: [],
  });
  const [isDesktopMapExpanded, setIsDesktopMapExpanded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "map">("chat");
  const [hasMapUpdate, setHasMapUpdate] = useState(false);

  const hydrateGlobalMapData = useCallback(async () => {
    try {
      const response = await apiFetch("/api/map/markers");
      const payload = (await response.json()) as ApiEnvelope<MapMarkersPayload>;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Failed to fetch map markers.");
      }

      const markerPayload = payload.data;
      const nextMarkers = Array.isArray(markerPayload.markers) ? markerPayload.markers : [];

      setMapData((prev) => ({
        center: prev?.center || DEFAULT_MAP_CENTER,
        zoom: prev?.zoom || DEFAULT_MAP_ZOOM,
        markers: nextMarkers.length > 0 ? nextMarkers : prev?.markers || [],
        legend: markerPayload.legend || prev?.legend,
        attribution: markerPayload.attribution || prev?.attribution,
        focusPing: prev?.focusPing,
        focusZoom: prev?.focusZoom,
        fitBounds: prev?.fitBounds,
        connectionLine: prev?.connectionLine,
      }));
    } catch {
      // Keep previous map data when background refresh fails.
    }
  }, []);

  useEffect(() => {
    // Keep map data ready from startup so mobile/secondary map views are immediately usable.
    void hydrateGlobalMapData();

    const refreshTimer = window.setInterval(() => {
      void hydrateGlobalMapData();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(refreshTimer);
  }, [hydrateGlobalMapData]);

  useEffect(() => {
    // Preload chat chunk shortly after first paint to keep Home reload smooth but transition instant.
    const preloadTimer = window.setTimeout(() => {
      void loadChatCanvas();
    }, 900);

    return () => window.clearTimeout(preloadTimer);
  }, []);

  const prepareChatCanvas = useCallback(() => {
    void loadChatCanvas();
  }, []);

  const navigateHome = useCallback((target: "top" | "conditions" | "news" = "top") => {
    setView("home");
    setHomeScrollTarget(target);
    setActiveHomeSection(target);
    setIsScrolled(false);
  }, []);

  const appendAiDelta = (messageId: string, delta: string) => {
    if (!delta) {
      return;
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              text: `${msg.text}${delta}`,
            }
          : msg,
      ),
    );
  };

  const resolveFinalReplyText = (
    streamedText: string,
    backendText: string,
    preserveStreamedText: boolean,
  ) => {
    if (!preserveStreamedText) {
      return backendText;
    }

    const streamed = streamedText || "";
    const backend = backendText || "";

    if (!streamed) return backend;
    if (!backend) return streamed;
    if (backend.includes(streamed)) return backend;
    if (streamed.includes(backend)) return streamed;

    return streamed.length >= backend.length ? streamed : backend;
  };

  const applyFinalPayload = (
    messageId: string,
    payload: QueryResponsePayload,
    options?: { preserveStreamedText?: boolean },
  ) => {
    const preserveStreamedText = !!options?.preserveStreamedText;

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) {
          return msg;
        }

        return {
          ...msg,
          text: resolveFinalReplyText(msg.text, payload.replyText, preserveStreamedText),
          tools: payload.tools,
        };
      }),
    );

    // Auto-trigger any map_focus tool actions silently
    const mapFocusTool = payload.tools?.find(t => t.action === 'map_focus' && t.payload?.map);
    if (mapFocusTool?.payload?.map) {
      const mp = mapFocusTool.payload.map;
      const newCenter = (mp.center && !isNaN(mp.center[0]) && !isNaN(mp.center[1]))
        ? mp.center : undefined;
      const newPing = (mp.focusPing && !isNaN(mp.focusPing[0]) && !isNaN(mp.focusPing[1]))
        ? mp.focusPing : undefined;
      const nextMarkers = mp.markers && mp.markers.length > 0 ? mp.markers : [];

      setMapData((prev) => ({
        center: newCenter || prev?.center || [-2.5489, 118.0149],
        zoom: mp.zoom || prev?.zoom || 5,
        markers: nextMarkers.length > 0 ? nextMarkers : prev?.markers || [],
        legend: prev?.legend,
        attribution: prev?.attribution,
        focusPing: newPing || newCenter,
        focusZoom: mp.focusZoom || mp.zoom,
        fitBounds: mp.fitBounds,
        connectionLine: mp.connectionLine,
      }));
      // Badge notification for mobile (don't auto-switch)
      setHasMapUpdate(true);
      setIsDesktopMapExpanded(true);
      void hydrateGlobalMapData();
    } else if (payload.mapData) {
      const pd = payload.mapData;
      const newCenter = (pd.center && !isNaN(pd.center[0]) && !isNaN(pd.center[1]))
        ? pd.center : undefined;
      const nextMarkers = pd.markers && pd.markers.length > 0 ? pd.markers : [];

      setMapData((prev) => ({
        center: newCenter || prev?.center || [-2.5489, 118.0149],
        zoom: pd.zoom || prev?.zoom || 5,
        markers: nextMarkers.length > 0 ? nextMarkers : prev?.markers || [],
        legend: pd.legend || prev?.legend,
        attribution: pd.attribution || prev?.attribution,
        focusPing: pd.focusPing,
        focusZoom: pd.focusZoom,
        fitBounds: pd.fitBounds,
        connectionLine: pd.connectionLine,
      }));
      setHasMapUpdate(true);
      setIsDesktopMapExpanded(true);
      void hydrateGlobalMapData();
    }
  };

  const simulateAIResponse = async (prompt: string) => {
    setIsTyping(true);
    const isSessionStart = !messages.some((msg) => msg.role === "user");

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text: prompt };
    const aiMessageId = (Date.now() + 1).toString();
    const aiMsg: ChatMessage = {
      id: aiMessageId,
      role: "ai",
      text: "",
      tools: [],
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);

    const fallbackToNonStream = async () => {
      const response = await apiFetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, isSessionStart }),
      });

      const payload = (await response.json()) as ApiEnvelope<QueryResponsePayload>;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || "Backend query failed.");
      }

      applyFinalPayload(aiMessageId, payload.data);
    };

    try {
      const response = await apiFetch("/api/query/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ prompt, isSessionStart }),
      });

      const contentType = response.headers.get("Content-Type") || "";
      if (!response.ok || !response.body || !contentType.includes("text/event-stream")) {
        await fallbackToNonStream();
        setIsTyping(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);

          if (!rawEvent) {
            boundary = buffer.indexOf("\n\n");
            continue;
          }

          const lines = rawEvent.split("\n");
          const eventLine = lines.find((line) => line.startsWith("event:"));
          const eventName = eventLine ? eventLine.slice(6).trim() : "message";
          const dataRaw = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");

          let eventData: unknown = null;
          if (dataRaw) {
            try {
              eventData = JSON.parse(dataRaw);
            } catch {
              eventData = null;
            }
          }

          if (eventName === "token") {
            const delta = typeof (eventData as { delta?: unknown })?.delta === "string"
              ? (eventData as { delta: string }).delta
              : "";
            appendAiDelta(aiMessageId, delta);
          }

          if (eventName === "done") {
            const donePayload = eventData as ApiEnvelope<QueryResponsePayload> | null;
            if (!donePayload || !donePayload.ok || !donePayload.data) {
              throw new Error("Invalid stream done payload.");
            }

            applyFinalPayload(aiMessageId, donePayload.data, { preserveStreamedText: true });
            hasDone = true;
          }

          if (eventName === "error") {
            const message =
              typeof (eventData as { error?: unknown })?.error === "string"
                ? (eventData as { error: string }).error
                : "Stream request failed.";
            throw new Error(message);
          }

          boundary = buffer.indexOf("\n\n");
        }
      }

      if (!hasDone) {
        await fallbackToNonStream();
      }
    } catch (streamError) {
      try {
        await fallbackToNonStream();
      } catch (fallbackError) {
        const streamMessage = streamError instanceof Error ? streamError.message : "Unknown stream error.";
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error.";

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? {
                  ...msg,
                  text: `Maaf, terjadi kendala saat mengambil data real-time. Silakan coba lagi.\n\nDetail stream: ${streamMessage}\nDetail fallback: ${fallbackMessage}`,
                  tools: [
                    {
                      id: "error-status",
                      type: "status",
                      label: "Status",
                      value: "Gangguan Sementara",
                      icon: "activity",
                      status: "warning",
                    },
                  ],
                }
              : msg,
          ),
        );

      }
    }

    setIsTyping(false);
  };

  const handleSearch = (prompt: string) => {
    prepareChatCanvas();
    simulateAIResponse(prompt);
    setView("chat");
    if (!mapData || mapData.markers.length === 0) {
      void hydrateGlobalMapData();
    }
  };

  const handleSendMessage = (text: string) => {
    simulateAIResponse(text);
  };

  const handleToolAction = (tool: ToolCall) => {
    // Pada mobile, klik tool card sebaiknya langsung arahkan ke tab peta, ada atau tidak data map baru.
    setActiveTab("map");

    const mapPayload = tool.payload?.map;
    if (!mapPayload) {
      return;
    }

    setMapData((prev) => {
      const fallbackCenter: [number, number] = prev?.center || [-6.2, 106.8];
      const center = mapPayload.center || fallbackCenter;
      const zoom = mapPayload.zoom || prev?.zoom || 9;
      const markers =
        mapPayload.markers && mapPayload.markers.length > 0
          ? mapPayload.markers
          : prev?.markers || [];

      return {
        center,
        zoom,
        markers,
        legend: mapPayload.markers && mapPayload.markers.length > 0 ? prev?.legend : prev?.legend,
        attribution: prev?.attribution,
        focusPing: mapPayload.focusPing,
        focusZoom: mapPayload.focusZoom || mapPayload.zoom || zoom,
        fitBounds: mapPayload.fitBounds,
        connectionLine: mapPayload.connectionLine,
      };
    });

    setHasMapUpdate(true);
    setIsDesktopMapExpanded(true);
    void hydrateGlobalMapData();
    setActiveTab("map");
  };

  const showDesktopMap = Boolean(mapData && isDesktopMapExpanded);

  return (
    <div className="h-[100dvh] w-full bg-white text-slate-900 font-sans overflow-hidden selection:bg-blue-100 selection:text-blue-900 relative flex flex-col">
      <Header
        isScrolled={view === "chat" || isScrolled}
        activeSection={view === "home" ? activeHomeSection : "top"}
        onNavigateHome={() => navigateHome("top")}
        onNavigateAlert={() => navigateHome("conditions")}
        onNavigateNews={() => navigateHome("news")}
      />
      
      <main className="h-full w-full relative overflow-hidden">
        <AnimatePresence mode="wait">
          {view === "home" ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.985, filter: "blur(2px)" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full"
            >
              <Home
                onSearch={handleSearch}
                onScroll={setIsScrolled}
                onPrepareChat={prepareChatCanvas}
                scrollTarget={homeScrollTarget}
                onSectionChange={setActiveHomeSection}
                onScrollTargetHandled={() => setHomeScrollTarget(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="h-full w-full flex flex-col md:flex-row relative z-10"
            >
            {/* === DESKTOP: Split View (always visible) === */}
            {/* Chat Panel - Desktop */}
            <motion.div
              initial={false}
              animate={{ width: showDesktopMap ? "35%" : "100%" }}
              transition={
                showDesktopMap
                  ? { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
                  : { duration: 0 }
              }
              className={`h-full hidden md:flex flex-col flex-none overflow-hidden ${
                showDesktopMap ? "border-r border-neutral-100" : ""
              }`}
            >
              <motion.div
                initial={false}
                animate={{ maxWidth: showDesktopMap ? "100%" : "896px" }}
                transition={
                  showDesktopMap
                    ? { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
                    : { duration: 0 }
                }
                className="h-full w-full mx-auto overflow-hidden relative"
              >
                <Suspense fallback={<PanelFallback />}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full w-full"
                  >
                    <ChatCanvas
                      messages={messages}
                      isTyping={isTyping}
                      onSendMessage={handleSendMessage}
                      onToolAction={handleToolAction}
                      onScroll={setIsScrolled}
                    />
                  </motion.div>
                </Suspense>
              </motion.div>
            </motion.div>

            {/* Map Panel - Desktop (fullwidth, extending under header) */}
            <AnimatePresence initial={false}>
              {showDesktopMap && (
                <motion.div
                  initial={{ width: "0%", opacity: 0 }}
                  animate={{ width: "65%", opacity: 1 }}
                  exit={{ width: "0%", opacity: 0 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="hidden md:block h-full border-l border-neutral-100 bg-white overflow-hidden flex-none relative"
                >
                  <div className="absolute inset-0 w-full h-full min-w-[500px]">
                    <Suspense fallback={<PanelFallback />}>
                      <MapPanel data={mapData} />
                    </Suspense>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* === MOBILE: Tab-based with Pill Bar === */}
            <div className="md:hidden h-full w-full relative">
              {/* Active View */}
              <div className="absolute inset-0">
                {activeTab === "chat" ? (
                  <Suspense fallback={<PanelFallback />}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full w-full"
                    >
                      <ChatCanvas
                        messages={messages}
                        isTyping={isTyping}
                        onSendMessage={handleSendMessage}
                        onToolAction={handleToolAction}
                        onScroll={setIsScrolled}
                        hasMobileTabs={true}
                      />
                    </motion.div>
                  </Suspense>
                ) : (
                  mapData ? (
                    <div className="w-full h-full">
                      <Suspense fallback={<PanelFallback />}>
                        <MapPanel data={mapData} />
                      </Suspense>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm px-6 text-center">
                      Memuat peta dan marker terbaru...
                    </div>
                  )
                )}
              </div>

              {/* Global Mobile Bottom Blur Layer (Hanya untuk Map, karena ChatCanvas sudah punya sendiri) */}
              {activeTab === "map" && (
                <div
                  className="absolute bottom-0 inset-x-0 z-[4900] pointer-events-none transition-all duration-300"
                  style={{
                    height: "120px",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    maskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
                    background: "linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.85) 100%)",
                  }}
                />
              )}

              {/* Bottom Pill Bar */}
              <div className="absolute bottom-0 inset-x-0 z-[5000] px-6 py-3 safe-area-pb pointer-events-none">
                <div className="relative z-10 flex gap-2 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                      activeTab === "chat"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5"><MessageSquare className="w-4 h-4" /> Chat</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("map");
                      setHasMapUpdate(false);
                      if (!mapData || mapData.markers.length === 0) {
                        void hydrateGlobalMapData();
                      }
                    }}
                    className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all relative ${
                      activeTab === "map"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5"><MapIcon className="w-4 h-4" /> Maps</div>
                    {hasMapUpdate && activeTab !== "map" && (
                      <span className="absolute top-1.5 right-4 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
