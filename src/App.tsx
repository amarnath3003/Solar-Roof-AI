import React, { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { Map } from "@/components/ui/map";
import { X, Search, Map as MapIcon, Layers, Monitor, MapPin, Download, Menu, Hexagon, Circle, Square, Minus } from "lucide-react";

type Coordinates = { lat: number; lng: number };
type NominatimResult = { display_name: string; lat: string; lon: string };
type RoofElement = { id: number; layerId: number; type: string; geoJSON: GeoJSON.Feature; style: { color: string } };
type ObstacleMarker = { id: number; layerId: number; type: "obstacle"; position: [number, number]; label: string };

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

/* 🧱 Reusable UI Components */

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div
    className={cn(
      "bg-white/[0.03] border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300 hover:scale-[1.01] hover:bg-white/[0.05] relative overflow-hidden group",
      className || ""
    )}
  >
    {/* Subtle gradient light overlay on hover */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    <div className="relative z-10 h-full">{children}</div>
  </div>
);

const Button = ({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) => {
  const variants = {
    primary:
      "bg-white/10 hover:bg-white/20 text-white border border-white/10 shadow-lg shadow-white/5 focus:ring-2 focus:ring-white/20",
    ghost: "text-zinc-400 hover:text-white hover:bg-white/5",
    outline: "border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white",
  };
  return (
    <button
      className={cn(
        "px-5 py-2.5 rounded-2xl transition-all duration-300 ease-out active:scale-[0.98] outline-none tracking-widest text-[11px] font-semibold flex items-center justify-center gap-2 uppercase whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className || ""
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={cn(
      "w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all font-light tracking-wide backdrop-blur-sm",
      className || ""
    )}
    {...props}
  />
);

/* ⚛️ Main Application */

export default function App() {
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [roofElements, setRoofElements] = useState<RoofElement[]>([]);
  const [obstacleMarkers, setObstacleMarkers] = useState<ObstacleMarker[]>([]);
  const [showMapTools, setShowMapTools] = useState(false);
  const [viewMode, setViewMode] = useState<"normal" | "satellite">("normal");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);

  /* 🗺️ Map Logic */
  const handleDrawCreated = useCallback((e: any) => {
    const { layerType, layer } = e;
    if (!featureGroupRef.current) return;
    featureGroupRef.current.addLayer(layer);
    if (layerType === "marker") {
      const position = (layer as L.Marker).getLatLng();
      setObstacleMarkers((prev) => [
        ...prev,
        {
          id: Date.now(),
          layerId: featureGroupRef.current!.getLayerId(layer),
          type: "obstacle",
          position: [position.lat, position.lng],
          label: "Obstacle",
        },
      ]);
      return;
    }
    const newElement: RoofElement = {
      id: Date.now(),
      layerId: featureGroupRef.current.getLayerId(layer),
      type: layerType,
      geoJSON: layer.toGeoJSON() as GeoJSON.Feature,
      style: {
        color: layerType === "polygon" || layerType === "rectangle" ? "#ffffff" : layerType === "circle" ? "#e5e5e5" : "#a3a3a3",
      },
    };
    setRoofElements((prev) => [...prev, newElement]);
  }, []);

  const handleDrawEdited = useCallback((e: any) => {
    if (!featureGroupRef.current) return;
    e.layers.eachLayer((layer: L.Layer) => {
      const id = featureGroupRef.current!.getLayerId(layer);
      if (layer instanceof L.Marker) {
        const position = layer.getLatLng();
        setObstacleMarkers((prev) =>
          prev.map((obs) => (obs.layerId === id ? { ...obs, position: [position.lat, position.lng] } : obs))
        );
        return;
      }
      setRoofElements((prev) =>
        prev.map((el) => (el.layerId === id ? { ...el, geoJSON: (layer as any).toGeoJSON() as GeoJSON.Feature } : el))
      );
    });
  }, []);

  const handleDrawDeleted = useCallback((e: any) => {
    if (!featureGroupRef.current) return;
    e.layers.eachLayer((layer: L.Layer) => {
      const id = featureGroupRef.current!.getLayerId(layer);
      if (layer instanceof L.Marker) {
        setObstacleMarkers((prev) => prev.filter((obs) => obs.layerId !== id));
        return;
      }
      setRoofElements((prev) => prev.filter((el) => el.layerId !== id));
    });
  }, []);

  const setupMapIfNeeded = useCallback(() => {
    if (!coordinates || !mapContainerRef.current) return;
    if (!mapRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
      const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: false }).setView(
        [coordinates.lat, coordinates.lng],
        19
      );

      const esriImagery = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21 }
      );
      esriImagery.addTo(map);

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      mapRef.current = map;
      featureGroupRef.current = drawnItems;
    }
    mapRef.current.setView([coordinates.lat, coordinates.lng], 19);
    if (locationMarkerRef.current) mapRef.current.removeLayer(locationMarkerRef.current);

    const locationMarker = L.circleMarker([coordinates.lat, coordinates.lng], {
      radius: 8,
      color: "#ffffff",
      fillColor: "#ffffff",
      fillOpacity: 0.9,
      weight: 2,
    });
    locationMarker.bindTooltip("Center", { direction: "top", className: "monochrome-tooltip" }).addTo(mapRef.current);
    locationMarkerRef.current = locationMarker;

    setTimeout(() => mapRef.current?.invalidateSize(), 300);
  }, [coordinates]);

  const syncDrawTools = useCallback(() => {
    if (!mapRef.current || !featureGroupRef.current) return;
    const map = mapRef.current;
    if (showMapTools && !drawControlRef.current) {
      const drawControl = new (L.Control as any).Draw({
        position: "topright",
        draw: { polyline: true, polygon: true, circle: true, rectangle: true, marker: true, circlemarker: false },
        edit: { featureGroup: featureGroupRef.current, remove: true },
      });
      map.addControl(drawControl);
      map.on((L as any).Draw.Event.CREATED, handleDrawCreated);
      map.on((L as any).Draw.Event.EDITED, handleDrawEdited);
      map.on((L as any).Draw.Event.DELETED, handleDrawDeleted);
      drawControlRef.current = drawControl;
    } else if (!showMapTools && drawControlRef.current) {
      map.removeControl(drawControlRef.current);
      map.off((L as any).Draw.Event.CREATED, handleDrawCreated);
      map.off((L as any).Draw.Event.EDITED, handleDrawEdited);
      map.off((L as any).Draw.Event.DELETED, handleDrawDeleted);
      drawControlRef.current = null;
    }
  }, [handleDrawCreated, handleDrawDeleted, handleDrawEdited, showMapTools]);

  useEffect(() => {
    if (viewMode === "satellite" && mapRef.current) setTimeout(() => mapRef.current?.invalidateSize(), 100);
  }, [viewMode]);

  useEffect(() => {
    setupMapIfNeeded();
  }, [setupMapIfNeeded]);
  
  useEffect(() => {
    syncDrawTools();
  }, [syncDrawTools]);

  useEffect(() => {
    return () => {
      if (mapRef.current) mapRef.current.remove();
    };
  }, []);

  /* 🔍 Search Logic */
  const searchAddress = async () => {
    const query = address.trim();
    if (!query) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(
          query
        )}`
      );
      const data = (await response.json()) as NominatimResult[];
      setSearchResults(data);
      if (data.length === 1) selectAddress(data[0]);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddress = (result: NominatimResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setAddress(result.display_name);
      setSelectedAddress(result.display_name);
      setCoordinates({ lat, lng });
      setSearchResults([]);
      setViewMode("normal");
      setMobileMenuOpen(false);
    }
  };

  const exportRoofData = () => {
    const data = {
      type: "FeatureCollection",
      features: [
        ...roofElements.map((el) => ({
          ...el.geoJSON,
          properties: { ...(el.geoJSON.properties ?? {}), elementType: el.type, style: el.style },
        })),
        ...obstacleMarkers.map((m) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [m.position[1], m.position[0]] },
          properties: { type: m.type, label: m.label },
        })),
      ],
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = "roof_monochrome_export.geojson";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex h-screen bg-[#050505] font-sans text-zinc-100 overflow-hidden relative selection:bg-white/20 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05)_0%,transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0 mix-blend-overlay" />

      {/* 📱 Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] md:hidden flex justify-end"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-4/5 max-w-sm h-full bg-[#0a0a0a] border-l border-white/10 p-6 flex flex-col gap-6 transform transition-transform"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h1 className="text-xl font-medium tracking-[0.2em] uppercase text-white">SolarRoof</h1>
              <Button variant="ghost" className="!p-2" onClick={() => setMobileMenuOpen(false)}>
                <X size={20} />
              </Button>
            </div>
            {/* Mobile Search Content (mirrors sidebar) */}
            <div className="flex flex-col gap-4">
              <Input
                placeholder="Search precise location..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchAddress()}
              />
              <Button onClick={searchAddress} disabled={isSearching} className="w-full">
                {isSearching ? "Locating..." : "Find Origin"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 🧭 Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-[340px] border-r border-white/10 bg-black/40 backdrop-blur-2xl z-20 relative p-6 gap-8 shadow-2xl">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none" />

        {/* Brand */}
        <header className="border-b border-white/10 pb-6 shrink-0">
          <h1 className="text-xl font-medium text-white tracking-[0.15em] uppercase flex items-center gap-4">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 border border-white/20">
              <Hexagon size={16} className="text-white" />
            </div>
            SolarRoof<span className="text-zinc-500 text-sm">.ai</span>
          </h1>
          <p className="text-[10px] text-zinc-500 font-medium tracking-[0.15em] mt-3 uppercase">
            Monochrome Workspace
          </p>
        </header>

        {/* Search Block */}
        <div className="flex flex-col gap-5 shrink-0">
          <div className="space-y-3">
            <Input
              placeholder="Search precise location..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchAddress()}
            />
            <Button onClick={searchAddress} disabled={isSearching} className="w-full h-12">
              {isSearching ? "Locating..." : "Find Origin"}
            </Button>
          </div>

          {/* Results Dropdown */}
          <div
            className={cn(
              "flex flex-col overflow-hidden transition-all duration-300 bg-white/5 border border-white/10 rounded-2xl",
              searchResults.length > 0 ? "max-h-64 opacity-100 mt-2" : "max-h-0 opacity-0 border-transparent"
            )}
          >
            <div className="overflow-y-auto custom-scrollbar">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => selectAddress(result)}
                  className="w-full text-left px-4 py-3 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0 truncate font-light tracking-wider uppercase"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Details Block */}
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

            <Button
              variant={showMapTools ? "outline" : "primary"}
              onClick={() => {
                setShowMapTools(!showMapTools);
                if (!showMapTools) setViewMode("satellite");
              }}
              className="w-full mt-auto h-12"
            >
              {showMapTools ? "Disable Workspace" : "Enable Workspace"}
            </Button>
          </div>
        )}
      </aside>

      {/* 🚀 Main Core */}
      <main className="flex-1 flex flex-col min-w-0 z-10 relative">
        {/* Header */}
        <header className="h-20 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 lg:px-10 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
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
              onClick={() => setViewMode("normal")}
              className={cn(
                "px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold rounded-xl transition-all duration-300",
                viewMode === "normal" ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              Base
            </button>
            <button
              onClick={() => setViewMode("satellite")}
              className={cn(
                "px-4 py-2 text-[10px] uppercase tracking-[0.15em] font-semibold rounded-xl transition-all duration-300",
                viewMode === "satellite" ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white hover:bg-white/5"
              )}
            >
              Imagery
            </button>
          </div>
        </header>

        {/* Content Area Grid */}
        <div className="flex-1 p-6 lg:p-10 overflow-hidden flex flex-col">
          {!coordinates ? (
            <div className="flex-1 flex items-center justify-center">
              <Card className="max-w-md w-full text-center flex flex-col items-center gap-8 py-12">
                <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-white/5 border border-white/10 shadow-[0_0_40px_rgba(255,255,255,0.05)]">
                  <Search size={32} className="text-white/40" />
                  <div className="absolute inset-0 border border-white/20 rounded-3xl animate-ping opacity-20"></div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-xl font-medium text-white tracking-[0.15em] uppercase">Awaiting Input</h2>
                  <p className="text-zinc-500 font-light text-xs tracking-widest leading-relaxed uppercase">
                    Initialize location search to load mapping environment
                  </p>
                </div>
              </Card>
            </div>
          ) : (
            <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full min-h-0">
              {/* Map Card */}
              <Card className="flex-1 p-0 rounded-3xl overflow-hidden border-white/20 shadow-2xl relative">
                <div className={`absolute inset-0 ${viewMode === "satellite" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"} transition-opacity duration-300`}>
                  <div ref={mapContainerRef} className="w-full h-full bg-black" />
                </div>
                <div className={`absolute inset-0 ${viewMode === "normal" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"} transition-opacity duration-300`}>
                  <Map center={[coordinates.lng, coordinates.lat]} zoom={18} />
                </div>
              </Card>

              {/* Data Panel - Shows up when tools are enabled */}
              {showMapTools && (
                <div className="w-full lg:w-72 flex flex-col gap-6 shrink-0 animate-fade-in-up mt-6 lg:mt-0">
                  <Card className="flex flex-col gap-6">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-medium text-zinc-400 flex items-center gap-2 border-b border-white/10 pb-4">
                      <Layers size={14} className="text-white" /> Intelligence
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                        <span className="text-3xl font-light text-white">{roofElements.length}</span>
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Shapes</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                        <span className="text-3xl font-light text-white">{obstacleMarkers.length}</span>
                        <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Obstacles</span>
                      </div>
                    </div>

                    <Button variant="ghost" className="w-full border-t border-white/5 pt-6 mt-2 rounded-t-none" onClick={exportRoofData}>
                      <Download size={14} /> Export GeoJSON
                    </Button>
                  </Card>
                  
                  <Card className="flex-1 flex flex-col gap-4">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-medium text-zinc-400 flex items-center gap-2">
                       <Monitor size={14} className="text-white" /> Log
                    </h3>
                    <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
                       {roofElements.length === 0 && obstacleMarkers.length === 0 ? (
                         <div className="m-auto text-zinc-600 text-[10px] uppercase tracking-widest text-center">No entities drawn</div>
                       ) : (
                         <>
                           {roofElements.map(el => (
                             <div key={el.id} className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-lg flex items-center gap-2 tracking-wide font-mono border border-white/5">
                               <Square size={10} className="text-white/60" /> {el.type.toUpperCase()} #{el.id.toString().slice(-4)}
                             </div>
                           ))}
                           {obstacleMarkers.map(el => (
                             <div key={el.id} className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-lg flex items-center gap-2 tracking-wide font-mono border border-white/5">
                               <Circle size={10} className="text-white/60" /> MKR #{el.id.toString().slice(-4)}
                             </div>
                           ))}
                         </>
                       )}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Global Embedded Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
        
        /* Animations */
        @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        /* Minimalist Leaflet Theme for Glassmorphism */
        .leaflet-container { font-family: inherit !important; background: transparent !important; }
        .leaflet-control-zoom, .leaflet-draw-toolbar {
          border: 1px solid rgba(255,255,255,0.15) !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
          backdrop-filter: blur(12px) !important;
          background: rgba(255,255,255,0.05) !important;
          margin-top: 16px !important;
          margin-right: 16px !important;
        }
        .leaflet-control-zoom a, .leaflet-draw-toolbar a {
          background-color: transparent !important;
          color: #fff !important;
          border-color: rgba(255,255,255,0.1) !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 36px !important;
          transition: all 0.2s ease-out;
        }
        .leaflet-control-zoom a:hover, .leaflet-draw-toolbar a:hover {
          background-color: rgba(255,255,255,0.1) !important;
        }
        
        .leaflet-interactive { stroke: #ffffff !important; stroke-width: 2px !important; fill: rgba(255,255,255,0.2) !important; }
        
        /* Tooltip */
        .monochrome-tooltip {
          background: rgba(0,0,0,0.8);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 6px;
          backdrop-filter: blur(8px);
          font-family: inherit;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .leaflet-tooltip-top:before { border-top-color: rgba(0,0,0,0.8); }
        .leaflet-container { outline: none !important; }
      `}} />
    </div>
  );
}
