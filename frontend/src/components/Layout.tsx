import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Hexagon, Layers3, Map, Ruler, Satellite, Search, SunMedium } from "lucide-react";
import { Button, Input } from "@/components/ui/glass";
import { cn } from "@/lib/utils";
import { NominatimResult, ViewMode } from "@/types";

type MainHeaderProps = {
  address: string;
  isSearching: boolean;
  searchResults: NominatimResult[];
  recentSearches: NominatimResult[];
  coordinates: { lat: number; lng: number } | null;
  showMapTools: boolean;
  viewMode: ViewMode;
  solarOverlayEnabled: boolean;
  onAddressChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSelectAddress: (result: NominatimResult) => void;
  onToggleWorkspace: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleSolarOverlay: () => void;
  onOpenDebug: () => void;
};

export function MainHeader({
  address,
  isSearching,
  searchResults,
  recentSearches,
  coordinates,
  showMapTools,
  viewMode,
  solarOverlayEnabled,
  onAddressChange,
  onSearchSubmit,
  onSelectAddress,
  onToggleWorkspace,
  onSetViewMode,
  onToggleSolarOverlay,
  onOpenDebug,
}: MainHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const showRecentSearches = isSearchFocused && address.trim().length === 0 && recentSearches.length > 0;
  const showSearchDropdown = showRecentSearches || searchResults.length > 0;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <header className="relative z-40 border-b border-white/10 bg-black/[0.35] backdrop-blur-2xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="px-4 py-4 sm:px-5 lg:px-8 xl:px-10">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3 xl:min-w-[190px]">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] shadow-[0_16px_40px_rgba(255,255,255,0.04)]">
              <Hexagon size={18} className="text-white" />
              <div className="absolute inset-0 rounded-2xl border border-white/10" />
            </div>
            <div className="space-y-1">
              <h1 className="text-sm font-medium uppercase tracking-[0.16em] text-white">
                SolarRoof<span className="text-zinc-500">.ai</span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Roof mapping workspace</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex w-full min-w-0 flex-col items-center gap-3 lg:flex-row lg:items-center lg:justify-center">
              <div ref={searchRef} className="relative w-full max-w-[560px]">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
                  />
                  <Input
                    placeholder="Search any address, landmark, or rooftop..."
                    value={address}
                    onChange={(event) => onAddressChange(event.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onKeyDown={(event) => event.key === "Enter" && onSearchSubmit()}
                    className="h-11 border-white/5 bg-black/30 pl-11 pr-14"
                  />
                  <Button
                    onClick={onSearchSubmit}
                    disabled={isSearching}
                    className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-xl px-0"
                    aria-label={isSearching ? "Searching" : "Search"}
                  >
                    <Search size={14} />
                  </Button>
                </div>
                <div
                  className={cn(
                    "absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden transition-all duration-300",
                    showSearchDropdown ? "max-h-72 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                  )}
                >
                  <div className="rounded-2xl border border-white/10 bg-black/[0.92] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {showRecentSearches && (
                        <>
                          <div className="px-4 pb-2 pt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Recent searches</div>
                          {recentSearches.map((result, index) => (
                            <button
                              key={`recent-${result.lat}-${result.lon}-${index}`}
                              onClick={() => onSelectAddress(result)}
                              className="flex w-full flex-col rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/[0.08]"
                            >
                              <span className="text-sm leading-relaxed text-zinc-200">{result.display_name}</span>
                            </button>
                          ))}
                          {searchResults.length > 0 ? <div className="my-2 border-t border-white/10" /> : null}
                        </>
                      )}
                      {searchResults.map((result, index) => (
                        <button
                          key={`${result.lat}-${result.lon}-${index}`}
                          onClick={() => onSelectAddress(result)}
                          className="flex w-full flex-col rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/[0.08]"
                        >
                          <span className="text-sm leading-relaxed text-zinc-200">{result.display_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                <div ref={menuRef} className="relative">
                  <Button
                    variant="outline"
                    onClick={() => setMenuOpen((previous) => !previous)}
                    className="h-11 px-3"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    <Layers3 size={16} />
                    <ChevronDown size={14} className={cn("transition-transform", menuOpen && "rotate-180")} />
                  </Button>
                  {menuOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 rounded-2xl border border-white/10 bg-black/[0.92] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
                      <button
                        type="button"
                        onClick={() => {
                          onSetViewMode("normal");
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <Map size={14} />
                          Base Map
                        </span>
                        {viewMode === "normal" ? <Check size={14} className="text-white" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetViewMode("satellite");
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <Satellite size={14} />
                          Imagery
                        </span>
                        {viewMode === "satellite" ? <Check size={14} className="text-white" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetViewMode("blueprint");
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <Ruler size={14} />
                          Blueprint View
                        </span>
                        {viewMode === "blueprint" ? <Check size={14} className="text-white" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleSolarOverlay();
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/5"
                      >
                        <span className="flex items-center gap-2">
                          <SunMedium size={14} />
                          Solar View
                        </span>
                        {solarOverlayEnabled ? <Check size={14} className="text-lime-300" /> : null}
                      </button>
                    </div>
                  )}
                </div>
                <Button
                  variant={showMapTools ? "outline" : "primary"}
                  onClick={onToggleWorkspace}
                  disabled={!coordinates}
                  className="h-11 min-w-[132px]"
                >
                  {showMapTools ? "Sidebar Off" : "Sidebar On"}
                </Button>
                <Button
                  variant="outline"
                  onClick={onOpenDebug}
                  className="h-11 min-w-[90px]"
                >
                  Debug
                </Button>
              </div>
            </div>
            <div className="text-center text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              {coordinates ? "Location ready. Open the sidebar only when you need tools." : "Search and select a roof to start."}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
