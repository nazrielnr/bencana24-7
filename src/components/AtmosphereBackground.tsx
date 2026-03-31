import React, { useEffect, useMemo, useState } from 'react';

export function AtmosphereBackground() {
  const [showRaindrops, setShowRaindrops] = useState(false);

  const raindrops = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animationDuration: `${1.2 + Math.random() * 1.8}s`,
      animationDelay: `-${Math.random() * 2}s`,
      height: `${26 + Math.random() * 60}px`,
      opacity: 0.15 + Math.random() * 0.25,
    }));
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setShowRaindrops(true);
    }, 1100);

    return () => window.clearTimeout(timerId);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none bg-slate-100">
      <div
        className="absolute inset-0 opacity-[0.05] z-10"
        style={{
          backgroundImage: "radial-gradient(rgba(15,23,42,0.2) 0.65px, transparent 0.65px)",
          backgroundSize: "3px 3px",
        }}
      />

      {/* Dark stormy cloud / fog at the top */}
      <div className="absolute top-0 inset-x-0 h-[72vh] bg-gradient-to-b from-slate-900/[0.2] via-slate-700/[0.08] to-transparent z-0" />

      {/* Ambient storm clouds */}
      <div className="absolute -top-[10%] -left-[10%] w-[70%] h-[70%] bg-slate-700/20 rounded-full blur-[64px] z-0" />
      <div className="absolute top-[10%] -right-[15%] w-[80%] h-[60%] bg-slate-800/15 rounded-full blur-[70px] z-0" />

      {/* Raindrops */}
      {showRaindrops && (
        <div className="absolute inset-0 z-0">
          {raindrops.map((drop) => (
            <div
              key={drop.id}
              className="absolute top-0 w-[1.5px] bg-gradient-to-b from-transparent via-slate-600 to-transparent animate-rainfall"
              style={{
                left: drop.left,
                height: drop.height,
                animationDuration: drop.animationDuration,
                animationDelay: drop.animationDelay,
                '--drop-opacity': drop.opacity,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}
      
      {/* Heavy fade at the bottom to blend with content */}
      <div className="absolute bottom-0 inset-x-0 h-[50vh] bg-gradient-to-t from-white via-white/95 to-transparent z-20" />
    </div>
  );
}
