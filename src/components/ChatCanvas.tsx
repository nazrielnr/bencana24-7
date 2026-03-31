import { motion, AnimatePresence } from "motion/react";
import { ChatMessage, ToolCall, WeatherWidgetPayload } from "../types";
import { ArrowUp, AlertTriangle } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import { cn } from "../lib/utils";
import { WeatherWidget } from "./WeatherWidget";

const markdownComponents: Components = {
  p: ({ className, children, ...props }) => (
    <p className={cn("my-3 leading-7 first:mt-0 last:mb-0 animate-slide-blur animate-slide-blur", className)} {...props}>
      {children}
    </p>
  ),
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("mt-5 mb-3 text-2xl font-semibold leading-tight animate-slide-blur animate-slide-blur", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2 className={cn("mt-4 mb-2 text-xl font-semibold leading-tight animate-slide-blur animate-slide-blur", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3 className={cn("mt-4 mb-2 text-lg font-semibold leading-tight animate-slide-blur animate-slide-blur", className)} {...props}>
      {children}
    </h3>
  ),
  ul: ({ className, children, ...props }) => (
    <ul className={cn("my-3 list-disc space-y-1 pl-5 animate-slide-blur animate-slide-blur", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol className={cn("my-3 list-decimal space-y-1 pl-5 animate-slide-blur animate-slide-blur", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }) => (
    <li className={cn("leading-7", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }) => (
    <blockquote className={cn("my-4 border-l-4 border-slate-200 pl-4 italic text-slate-600", className)} {...props}>
      {children}
    </blockquote>
  ),
  pre: ({ className, children, ...props }) => (
    <pre className={cn("my-4 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 text-slate-50", className)} {...props}>
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const codeText = Array.isArray(children) ? children.join("") : String(children);
    const isBlockCode = codeText.includes("\n");

    return (
      <code
        className={cn(
          isBlockCode
            ? "font-mono text-[0.95em] text-slate-50"
            : "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  a: ({ className, children, href, ...props }) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-medium text-sky-700 underline underline-offset-4 hover:text-sky-900", className)}
    >
      {children}
    </a>
  ),
  hr: ({ className, ...props }) => <hr className={cn("my-5 border-slate-200", className)} {...props} />,
};

function removeUnpairedSurrogates(value: string): string {
  let output = "";

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[i] + value[i + 1];
        i++;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    output += value[i];
  }

  return output;
}

function sanitizeAssistantMarkdown(raw: string): string {
  if (!raw) return "";

  let text = raw.replace(/\r\n/g, "\n");

  text = removeUnpairedSurrogates(text);
  text = text.replace(/\uFFFD/g, "");

  // Strip fenced-code wrappers (``` / ```markdown) so markdown stays renderable.
  text = text.replace(/^\s*```(?:[a-z0-9_-]+)?\s*$/gim, "");
  text = text.replace(/^\s*```(?:[a-z0-9_-]*)?\n?/i, "");
  text = text.replace(/\n?```+\s*$/i, "");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

interface ChatCanvasProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onSendMessage: (text: string) => void;
  onToolAction?: (tool: ToolCall) => void;
  onScroll?: (isScrolled: boolean) => void;
  hasMobileTabs?: boolean;
}

export function useSmoothStream(text: string, isTyping: boolean) {
  const [displayed, setDisplayed] = useState(text);

  useEffect(() => {
    if (!isTyping) {
      setDisplayed(text);
      return;
    }

    let animationFrame: number;
    
    // Instead of jittery setInterval, we use requestAnimationFrame to smoothly crawl towards the target string
    const updateText = () => {
      setDisplayed((prev) => {
        if (prev.length < text.length) {
          const diff = text.length - prev.length;
          // Dynamically adjust step size - larger chunks move faster, creating a fluid spring effect
          const step = Math.max(1, Math.floor(diff * 0.15));
          return text.slice(0, prev.length + step);
        }
        return prev;
      });
      animationFrame = requestAnimationFrame(updateText);
    };

    animationFrame = requestAnimationFrame(updateText);

    return () => cancelAnimationFrame(animationFrame);
  }, [text, isTyping]);

  return displayed;
}

export function StreamingMessage({ text, isTyping }: { text: string; isTyping: boolean }) {
  const displayedText = useSmoothStream(text, isTyping);
  const normalizedText = sanitizeAssistantMarkdown(displayedText);

  return (
    <div className="max-w-none text-slate-900 leading-7 transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ wordBreak: 'break-word' }}>
      <ReactMarkdown components={markdownComponents}>{normalizedText}</ReactMarkdown>
    </div>
  );
}

export function ChatCanvas({ messages, isTyping, onSendMessage, onToolAction, onScroll, hasMobileTabs = false }: ChatCanvasProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const isLastMessage = (id: string) => messages[messages.length - 1]?.id === id;

  const getEarthquakeTheme = (status?: string) => {
    if (status === "danger") {
      return {
        shell: "border-neutral-200 hover:border-neutral-300",
        accent: "bg-red-50 text-red-600 border-red-100",
        label: "text-red-600",
        badge: "bg-red-50 text-red-600 border-red-200/60 pb-px",
        hint: "text-red-500",
        icon: "text-red-500",
      };
    }

    if (status === "warning") {
      return {
        shell: "border-neutral-200 hover:border-neutral-300",
        accent: "bg-amber-50 text-amber-600 border-amber-100",
        label: "text-amber-600",
        badge: "bg-amber-50 text-amber-600 border-amber-200/60 pb-px",
        hint: "text-amber-500",
        icon: "text-amber-500",
      };
    }

    return {
      shell: "border-neutral-200 hover:border-neutral-300",
      accent: "bg-emerald-50 text-emerald-600 border-emerald-100",
      label: "text-emerald-600",
      badge: "bg-emerald-50 text-emerald-600 border-emerald-200/60 pb-px",
      hint: "text-emerald-500",
      icon: "text-emerald-500",
    };
  };

  const getEarthquakeLabel = (status?: string) => {
    if (status === "danger") return "Bahaya";
    if (status === "warning") return "Siaga";
    return "Aman";
  };

  // Selalu force scroll ke bawah saat ada penambahan pesan baru (user mengirim)
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [messages.length]);

  // Autoscroll penyelesaian saat komponen toolcards (widget) dimuat di akhir stream
  useEffect(() => {
    if (!isTyping) {
      const timer = setTimeout(() => {
        const scrollContainer = scrollRef.current;
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }, 150); // Jeda aman untuk membiarkan layout Framer Motion mengalokasikan tinggi DOM
      return () => clearTimeout(timer);
    }
  }, [isTyping]);

  // Menjaga pergeseran (auto-scroll) tetap berjalan halus selama streaming teks
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const observer = new MutationObserver(() => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      // Perbesar threshold batas bawah sangat ekstrem (800) karena widget cuaca dan berita lebarnya memakan banyak blok px secara instan.
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 800;
      if (isNearBottom) {
        scrollContainer.scrollTop = scrollHeight;
      }
    });

    observer.observe(scrollContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isTyping) {
      onSendMessage(input);
      setInput("");
    }
  };

  return (
    <div className="relative w-full h-full bg-transparent overflow-hidden">
      {/* Chat Area */}
      <div 
        ref={scrollRef} 
        className="absolute inset-0 overflow-y-auto px-4 pt-24 scroll-smooth md:px-8"
        style={{ paddingBottom: hasMobileTabs ? 'calc(160px + env(safe-area-inset-bottom))' : '100px' }}
        onScroll={(e) => onScroll?.((e.target as HTMLDivElement).scrollTop > 20)}
      >
        <div className="max-w-3xl mx-auto space-y-8">
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex w-full",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] md:max-w-[70%] bg-[#f4f4f5] text-slate-900 px-5 py-3.5 rounded-3xl rounded-tr-sm text-[15px] leading-relaxed">
                      {msg.text}
                    </div>
                  ) : (
                      <div className="w-full max-w-3xl text-slate-900 text-[15px] leading-relaxed transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                        <StreamingMessage text={msg.text} isTyping={isTyping && isLastMessage(msg.id)} />

                      {msg.tools && msg.tools.some((tool) => tool.type === "weather_widget" || tool.type === "earthquake") && (
                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                            {msg.tools.map((tool, i) => {
                            if (tool.type === "weather_widget" && tool.payload?.weather) {
                              return (
                                <motion.div
                                  key={tool.id}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05, duration: 0.3 }}
                                  className="col-span-1 sm:col-span-2"
                                >
                                  <WeatherWidget data={tool.payload.weather as WeatherWidgetPayload} />
                                </motion.div>
                              );
                            }

                            if (tool.type === "earthquake") {
                              const theme = getEarthquakeTheme(tool.status);
                              const statusLabel = getEarthquakeLabel(tool.status);

                              let magnitude = "--";
                              let depth = "--";
                              let locationDesc = tool.value;

                              // Parse "Gempa: M5.4 (43 km) - 115 km BaratDaya KOTA-..."
                              const mParse = tool.value.match(/(?:Gempa:\s*)?M([\d.]+)\s*\(([^)]+)\)\s*(?:[-:]\s*)?(.*)/i);
                              if (mParse) {
                                magnitude = mParse[1];
                                depth = mParse[2];
                                locationDesc = mParse[3];
                              } else {
                                locationDesc = tool.value.replace(/^Gempa:\s*/i, "");
                                const mBackup = tool.value.match(/M([\d.]+)/);
                                if (mBackup) magnitude = mBackup[1];
                              }

                              const isHighMag = magnitude !== "--" && parseFloat(magnitude) >= 5;

                              return (
                                <motion.div
                                  key={tool.id}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05, duration: 0.3 }}
                                  className={cn(
                                    "col-span-1 sm:col-span-2 w-full overflow-hidden rounded-xl border bg-white font-sans text-neutral-900 shadow-sm transition-all hover:border-neutral-300 cursor-pointer group",
                                    theme.shell
                                  )}
                                  onClick={() => onToolAction?.(tool)}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-5 p-4 border-b border-neutral-100">
                                    {/* Header / Location / Main */}
                                    <div className="flex flex-col gap-3 min-w-[200px] flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                                          <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0", theme.icon)} />
                                          <span className="truncate max-w-full">{tool.label}</span>
                                        </span>
                                        <span className={cn("inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", theme.badge)}>
                                          {statusLabel}
                                        </span>
                                      </div>
                                      
                                      <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-3xl text-neutral-400 font-mono align-baseline tracking-tighter mr-0.5">M</span>
                                        <span className={cn("font-mono text-[4rem] sm:text-6xl font-medium tracking-tighter leading-none", isHighMag ? "text-red-600" : "text-neutral-950")}>
                                          {magnitude}
                                        </span>
                                      </div>

                                      <div className="flex items-start gap-2 text-sm font-medium text-neutral-600 max-w-full leading-relaxed break-words">
                                        <span>{locationDesc}</span>
                                      </div>
                                    </div>

                                    {/* Current Stats Grid */}
                                    <div className="grid grid-cols-2 gap-2 w-full sm:w-[220px] shrink-0 h-fit">
                                      <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-neutral-200/60 bg-neutral-50/50 p-3 min-w-0">
                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 truncate">
                                          Kedalaman
                                        </span>
                                        <span className="font-mono text-sm font-medium text-neutral-900 leading-none tracking-tight truncate">{depth}</span>
                                      </div>
                                      <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-neutral-200/60 bg-neutral-50/50 p-3 min-w-0">
                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 truncate">
                                          Detail
                                        </span>
                                        <span className={cn("font-mono text-[10px] font-medium leading-tight tracking-tight break-words", theme.label)}>
                                          {tool.description ? tool.description.replace(/^Status:\s*/i, "").replace("Terdeteksi di wilayah ", "") : statusLabel}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Info Strip */}
                                  <div className="px-4 py-3 bg-neutral-50/50 rounded-b-xl flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                                      Tap to view map details
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-neutral-400 group-hover:text-black transition-colors uppercase tracking-widest ml-auto">
                                      View →
                                    </span>
                                  </div>
                                </motion.div>
                              );
                            }

                            return null;
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Typing Indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-start max-w-3xl mx-auto"
              >
                <div className="flex items-center gap-2 text-slate-400 py-2">
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Blurred Backdrop */}
      <div 
        aria-hidden 
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          height: hasMobileTabs ? "190px" : "140px",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 100%)",
          background: "linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.85) 100%)"
        }}
      />

      {/* Input Area */}
      <div 
        className={cn(
          "absolute inset-x-0 z-20 pointer-events-none",
          !hasMobileTabs && "safe-area-pb"
        )}
        style={{ bottom: hasMobileTabs ? 'calc(64px + env(safe-area-inset-bottom))' : '0px' }}
      >
        <div className="max-w-3xl mx-auto relative z-10 pointer-events-auto px-4 py-3 md:px-8 md:py-5">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center bg-white/90 backdrop-blur-sm border border-slate-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-3xl overflow-hidden transition-all duration-300 focus-within:bg-white focus-within:border-slate-300 focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about any location, disaster, or weather..."
              className="w-full py-4 px-5 text-base bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-500"
              disabled={isTyping}
            />
            <button
              type="submit"
              aria-label="Kirim pertanyaan"
              disabled={!input.trim() || isTyping}
              className="mr-2 p-2.5 bg-black text-white rounded-2xl disabled:opacity-30 disabled:bg-slate-200 disabled:text-slate-400 transition-all hover:bg-slate-800"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
