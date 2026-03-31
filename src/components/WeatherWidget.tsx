import { WeatherWidgetPayload } from "../types";
import { CloudRain, Droplets, Wind, Sun, Cloud, CloudLightning, CloudDrizzle, CloudSun, Snowflake, CloudFog, MapPin } from "lucide-react";

function getWeatherIcon(desc: string, size = "w-4 h-4") {
  const d = desc.toLowerCase();
  if (d.includes("petir") || d.includes("thunder")) return <CloudLightning className={`${size} text-neutral-800`} />;
  if (d.includes("lebat") || d.includes("heavy")) return <CloudRain className={`${size} text-neutral-800`} />;
  if (d.includes("hujan") || d.includes("rain")) return <CloudDrizzle className={`${size} text-neutral-800`} />;
  if (d.includes("cerah berawan") || d.includes("partly")) return <CloudSun className={`${size} text-neutral-600`} />;
  if (d.includes("berawan") || d.includes("cloud")) return <Cloud className={`${size} text-neutral-600`} />;
  if (d.includes("kabut") || d.includes("fog") || d.includes("asap")) return <CloudFog className={`${size} text-neutral-500`} />;
  if (d.includes("salju") || d.includes("snow")) return <Snowflake className={`${size} text-neutral-600`} />;
  if (d.includes("cerah") || d.includes("clear") || d.includes("sunny")) return <Sun className={`${size} text-neutral-800`} />;
  return <Cloud className={`${size} text-neutral-500`} />;
}

export function WeatherWidget({ data }: { data: WeatherWidgetPayload }) {
  const { current, hourly, locationName } = data;

  const statItem = "flex flex-col gap-1 rounded-lg border border-neutral-200/60 bg-neutral-50/50 p-2.5";
  const statLabelClasses = "flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-neutral-500";
  const statValueClasses = "font-mono text-sm font-medium text-neutral-900 leading-none tracking-tight";

  return (
    <div className="w-full overflow-hidden rounded-xl border border-neutral-200 bg-white font-sans text-neutral-900 shadow-sm transition-all hover:border-neutral-300">
      <div className="flex flex-wrap items-start justify-between gap-5 p-4 border-b border-neutral-100">
        
        {/* Header / Location / Main */}
        <div className="flex flex-col gap-3 min-w-[200px] flex-1">
          <div className="flex items-center gap-2 max-w-full">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-400 truncate">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{locationName}</span>
            </span>
          </div>
          
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-[4rem] sm:text-6xl font-medium tracking-tighter text-neutral-950 leading-none">
              {current.temp}
              <span className="text-3xl text-neutral-400 align-super ml-0.5">°</span>
            </span>
          </div>

          <div className="flex items-start gap-2 text-sm font-medium text-neutral-600 max-w-full leading-relaxed break-words">
            <div className="shrink-0 pt-0.5">
              {getWeatherIcon(current.desc, "w-4 h-4")}
            </div>
            <span>{current.desc}</span>
          </div>
        </div>

        {/* Current Stats Grid */}
        <div className="grid grid-cols-2 gap-2 w-full sm:w-[220px] shrink-0 h-fit">
          <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-neutral-200/60 bg-neutral-50/50 p-3 min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 truncate">
              {/* No icon, keep simple brutalist layout */}
              Humidity
            </span>
            <span className={statValueClasses}>{current.humidity}%</span>
          </div>
          <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-neutral-200/60 bg-neutral-50/50 p-3 min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 truncate">
              Wind
            </span>
            <div className="flex items-baseline gap-1">
              <span className={statValueClasses}>{current.windSpeed}</span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono">km/h</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hourly Forecast Strip */}
      {hourly.length > 1 && (
        <div className="p-3 bg-neutral-50/50 rounded-b-xl overflow-x-auto no-scrollbar">
          <div className="flex gap-2 min-w-max">
            {hourly.slice(0, 7).map((h, i) => (
              <div
                key={i}
                className={`flex flex-col items-center justify-between gap-2.5 rounded-lg border px-3 py-2.5 w-[68px] transition-colors ${
                  i === 0
                    ? "border-neutral-300 bg-white shadow-sm"
                    : "border-transparent hover:border-neutral-200 hover:bg-white"
                }`}
              >
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  {h.time}
                </span>
                {getWeatherIcon(h.desc, "w-4.5 h-4.5")}
                <div className="flex flex-col items-center gap-1">
                  <span className="font-mono text-sm font-semibold tracking-tight text-neutral-900">{h.temp}°</span>
                  <span className="font-mono text-[9px] text-neutral-400">{h.humidity}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
