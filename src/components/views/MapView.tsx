import { Map, Globe } from "lucide-react";

export function MapView() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
      <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center">
        <Globe size={32} className="text-zinc-600" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-400">Mesh Map</p>
        <p className="text-xs text-zinc-600 mt-1">
          Interactive map coming in Phase 4
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">
          Will show node positions with OpenStreetMap tiles
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 mt-2">
        <Map size={12} />
        <span>Leaflet + react-leaflet</span>
      </div>
    </div>
  );
}
