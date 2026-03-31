import { cn } from "../lib/utils";

interface HeaderProps {
  isScrolled?: boolean;
  activeSection?: "top" | "conditions" | "news";
  onNavigateHome?: () => void;
  onNavigateAlert?: () => void;
  onNavigateNews?: () => void;
}

export function Header({ isScrolled, activeSection, onNavigateHome, onNavigateAlert, onNavigateNews }: HeaderProps) {
  const alertActive = activeSection === "conditions";
  const newsActive = activeSection === "news";

  return (
    <>
      {/* Background Gradient Mask and Blur Layer */}
      {isScrolled && (
        <div
          className={cn("fixed top-0 inset-x-0 h-24 z-[4900] pointer-events-none opacity-100 transition-opacity duration-300")}
          style={{
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            maskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 100%)",
            backgroundColor: "rgba(255, 255, 255, 0.4)",
          }}
        />
      )}
      
      <header className="fixed top-0 inset-x-0 h-16 z-[5000] flex items-center justify-between px-6">
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex items-center font-semibold text-slate-900 tracking-tight hover:text-slate-700 transition-colors"
          aria-label="Kembali ke home"
        >
          <span>Bencana24/7</span>
        </button>

        <nav className="hidden md:flex items-center gap-8">
          <button
            type="button"
            onClick={onNavigateAlert}
            aria-current={alertActive ? "page" : undefined}
            className={`text-sm font-medium transition-colors ${alertActive ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
          >
            Alert
          </button>
          <button
            type="button"
            onClick={onNavigateNews}
            aria-current={newsActive ? "page" : undefined}
            className={`text-sm font-medium transition-colors ${newsActive ? "text-slate-900" : "text-slate-500 hover:text-slate-900"}`}
          >
            News
          </button>
        </nav>
      </header>
    </>
  );
}
