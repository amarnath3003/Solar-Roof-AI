import { Hexagon, MapPin, Menu, X } from "lucide-react";
import { Button, Input } from "@/components/ui/glass";
import { cn } from "@/lib/utils";
import { Coordinates, NominatimResult, ViewMode } from "@/types";

type MobileMenuOverlayProps = {
  open: boolean;
  address: string;
  isSearching: boolean;
  onClose: () => void;
  onAddressChange: (value: string) => void;
  onSearchSubmit: () => void;
};

type DesktopSidebarProps = {
  address: string;
  isSearching: boolean;
  searchResults: NominatimResult[];
  selectedAddress: string | null;
  coordinates: Coordinates | null;
  showMapTools: boolean;
  onAddressChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSelectAddress: (result: NominatimResult) => void;
  onToggleWorkspace: () => void;
};

type MainHeaderProps = {
  viewMode: ViewMode;
  solarOverlayEnabled: boolean;
  onOpenMobileMenu: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleSolarOverlay: () => void;
};

export function MobileMenuOverlay({
  open,
  address,
  isSearching,
  onClose,
  onAddressChange,
  onSearchSubmit,
}: MobileMenuOverlayProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] md:hidden flex justify-end" onClick={onClose}>
      <div
        className="w-4/5 max-w-sm h-full bg-[#0a0a0a] border-l border-white/10 p-6 flex flex-col gap-6 transform transition-transform"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <h1 className="text-xl font-medium tracking-[0.2em] uppercase text-white">SolarRoof</h1>
          <Button variant="ghost" className="!p-2" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <Input
            placeholder="Search precise location..."
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSearchSubmit()}
          />
          <Button onClick={onSearchSubmit} disabled={isSearching} className="w-full">
            {isSearching ? "Locating..." : "Find Origin"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DesktopSidebar({
  address,
  isSearching,
  searchResults,
  selectedAddress,
  coordinates,
  showMapTools,
  onAddressChange,
  onSearchSubmit,
  onSelectAddress,
  onToggleWorkspace,
}: DesktopSidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-[340px] border-r border-white/10 bg-black/40 backdrop-blur-2xl z-20 relative p-6 gap-8 shadow-2xl">
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none" />

      <header className="border-b border-white/10 pb-6 shrink-0">
        <h1 className="text-xl font-medium text-white tracking-[0.15em] uppercase flex items-center gap-4">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20">
            <Hexagon size={16} className="text-white" />
          </div>
          SolarRoof<span className="text-zinc-500 text-sm">.ai</span>
        </h1>
        <p className="text-[10px] text-zinc-500 font-medium tracking-[0.15em] mt-3 uppercase">Monochrome Workspace</p>
      </header>

      <div className="flex flex-col gap-5 shrink-0">
        <div className="space-y-3">
          <Input
            placeholder="Search precise location..."
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSearchSubmit()}
          />
          <Button onClick={onSearchSubmit} disabled={isSearching} className="w-full h-12">
            {isSearching ? "Locating..." : "Find Origin"}
          </Button>
        </div>

        <div
          className={cn(
            "flex flex-col overflow-hidden transition-all duration-300 bg-white/5 border border-white/10 rounded-2xl",
            searchResults.length > 0 ? "max-h-64 opacity-100 mt-2" : "max-h-0 opacity-0 border-transparent"
          )}
        >
          <div className="overflow-y-auto custom-scrollbar">
            {searchResults.map((result, index) => (
              <button
                key={`${result.lat}-${result.lon}-${index}`}
                onClick={() => onSelectAddress(result)}
                className="w-full text-left px-4 py-3 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0 truncate font-light tracking-wider uppercase"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedAddress && coordinates && (
        <div className="border-t border-white/10 pt-6 flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <MapPin size={12} className="text-white" /> Selected Region
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed font-light">{selectedAddress}</p>
            <div className="inline-flex items-center gap-3 text-[10px] text-zinc-400 font-mono bg-white/5 py-2 px-4 rounded-xl border border-white/10">
              <span className="text-zinc-200">LAT {coordinates.lat.toFixed(4)}</span>
              <span className="text-white/20">|</span>
              <span className="text-zinc-200">LNG {coordinates.lng.toFixed(4)}</span>
            </div>
          </div>

          <Button variant={showMapTools ? "outline" : "primary"} onClick={onToggleWorkspace} className="w-full mt-auto h-12">
            {showMapTools ? "Disable Workspace" : "Enable Workspace"}
          </Button>
        </div>
      )}
    </aside>
  );
}

export function MainHeader({ viewMode, solarOverlayEnabled, onOpenMobileMenu, onSetViewMode, onToggleSolarOverlay }: MainHeaderProps) {
  return (
    <header className="h-20 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 lg:px-10 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <button className="md:hidden" onClick={onOpenMobileMenu}>
          <Menu size={24} className="text-white hover:text-white/80 transition-colors" />
        </button>
        <div className="hidden sm:flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-400">System Online</span>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-xl">
        <button
          onClick={() => onSetViewMode("normal")}
          className={cn(
            "px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold rounded-xl transition-all duration-300",
            viewMode === "normal" ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white hover:bg-white/5"
          )}
        >
          Base
        </button>
        <button
          onClick={() => onSetViewMode("satellite")}
          className={cn(
            "px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold rounded-xl transition-all duration-300",
            viewMode === "satellite" ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white hover:bg-white/5"
          )}
        >
          Imagery
        </button>
        <button
          onClick={onToggleSolarOverlay}
          className={cn(
            "px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold rounded-xl transition-all duration-300",
            solarOverlayEnabled ? "bg-lime-300 text-black shadow-lg" : "text-zinc-500 hover:text-white hover:bg-white/5"
          )}
        >
          Solar View
        </button>
      </div>
    </header>
  );
}
