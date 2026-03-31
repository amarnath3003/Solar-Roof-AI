import React, { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { Map } from "@/components/ui/map";

type Coordinates = { lat: number; lng: number };
type NominatimResult = { display_name: string; lat: string; lon: string };
type RoofElement = { id: number; layerId: number; type: string; geoJSON: GeoJSON.Feature; style: { color: string } };
type ObstacleMarker = { id: number; layerId: number; type: "obstacle"; position: [number, number]; label: string };

export default function App() {
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [roofElements, setRoofElements] = useState<RoofElement[]>([]);
  const [obstacleMarkers, setObstacleMarkers] = useState<ObstacleMarker[]>([]);
  const [showMapTools, setShowMapTools] = useState(false);
  const [viewMode, setViewMode] = useState<"normal" | "satellite">("normal");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);

  const handleDrawCreated = useCallback((e: any) => {
    const { layerType, layer } = e;
    if (!featureGroupRef.current) return;
    featureGroupRef.current.addLayer(layer);
    if (layerType === "marker") {
      const position = (layer as L.Marker).getLatLng();
      setObstacleMarkers(prev => [...prev, { id: Date.now(), layerId: featureGroupRef.current!.getLayerId(layer), type: "obstacle", position: [position.lat, position.lng], label: "Obstacle" }]);
      return;
    }
    const newElement: RoofElement = {
      id: Date.now(),
      layerId: featureGroupRef.current.getLayerId(layer),
      type: layerType,
      geoJSON: layer.toGeoJSON() as GeoJSON.Feature,
      style: { color: layerType === "polygon" || layerType === "rectangle" ? "#ffffff" : layerType === "circle" ? "#e5e5e5" : "#a3a3a3" },
    };
    setRoofElements(prev => [...prev, newElement]);
  }, []);

  const handleDrawEdited = useCallback((e: any) => {
    if (!featureGroupRef.current) return;
    e.layers.eachLayer((layer: L.Layer) => {
      const id = featureGroupRef.current!.getLayerId(layer);
      if (layer instanceof L.Marker) {
        const position = layer.getLatLng();
        setObstacleMarkers(prev => prev.map(obs => obs.layerId === id ? { ...obs, position: [position.lat, position.lng] } : obs));
        return;
      }
      setRoofElements(prev => prev.map(el => el.layerId === id ? { ...el, geoJSON: (layer as any).toGeoJSON() as GeoJSON.Feature } : el));
    });
  }, []);

  const handleDrawDeleted = useCallback((e: any) => {
    if (!featureGroupRef.current) return;
    e.layers.eachLayer((layer: L.Layer) => {
      const id = featureGroupRef.current!.getLayerId(layer);
      if (layer instanceof L.Marker) {
        setObstacleMarkers(prev => prev.filter(obs => obs.layerId !== id));
        return;
      }
      setRoofElements(prev => prev.filter(el => el.layerId !== id));
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
      const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: false }).setView([coordinates.lat, coordinates.lng], 19);
      
      // Only using Satellite view in Leaflet now.
      const esriImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 21 });
      esriImagery.addTo(map);
      
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      mapRef.current = map;
      featureGroupRef.current = drawnItems;
    }
    mapRef.current.setView([coordinates.lat, coordinates.lng], 19);
    if (locationMarkerRef.current) mapRef.current.removeLayer(locationMarkerRef.current);
    
    // Monochrome aesthetic marker
    const locationMarker = L.circleMarker([coordinates.lat, coordinates.lng], { radius: 8, color: "#ffffff", fillColor: "#ffffff", fillOpacity: 0.9, weight: 2 });
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

  // Handle map resizing when switching views
  useEffect(() => {
    if (viewMode === "satellite" && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    }
  }, [viewMode]);

  useEffect(() => { setupMapIfNeeded(); }, [setupMapIfNeeded]);
  useEffect(() => { syncDrawTools(); }, [syncDrawTools]);
  
  useEffect(() => { return () => { if (mapRef.current) mapRef.current.remove(); }; }, []);

  const searchAddress = async () => {
    const query = address.trim();
    if (!query) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`);
      const data = await response.json() as NominatimResult[];
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
      setViewMode("normal"); // Default to normal view after searching
    }
  };

  const exportRoofData = () => {
    const data = {
      type: "FeatureCollection",
      features: [
        ...roofElements.map(el => ({ ...el.geoJSON, properties: { ...(el.geoJSON.properties ?? {}), elementType: el.type, style: el.style } })),
        ...obstacleMarkers.map(m => ({ type: "Feature", geometry: { type: "Point", coordinates: [m.position[1], m.position[0]] }, properties: { type: m.type, label: m.label } })),
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
    <div className="flex h-screen bg-[#0a0a0a] font-sans text-neutral-100 overflow-hidden relative selection:bg-white/30 selection:text-white">
      {/* Absolute grid pattern for aesthetic */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      {/* Sidebar - Monochrome Glass */}
      <div className="w-[360px] flex-shrink-0 bg-black/60 backdrop-blur-2xl border-r border-white/10 p-7 flex flex-col gap-8 overflow-y-auto z-20 shadow-2xl relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />
        
        <div className="animate-fade-in-down mb-4 border-b border-white/10 pb-6 pointer-events-auto">
          <h1 className="text-xl font-semibold text-white tracking-widest uppercase flex items-center gap-3">
            <span className="w-4 h-4 bg-white rounded-sm rotate-45 inline-block"></span>
            SolarRoof
          </h1>
          <p className="text-[11px] text-neutral-500 font-medium tracking-widest mt-2 uppercase">
            Monochrome Workspace
          </p>
        </div>

        {/* Search */}
        <div className="animate-fade-in-up flex flex-col gap-6 pointer-events-auto z-10">
          <div className="flex flex-col gap-3">
            <div className="relative group">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchAddress(); }}
                placeholder="Search precise location..."
                className="w-full bg-neutral-900/50 border border-white/10 rounded-none py-3.5 px-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-white/50 focus:border-white/30 transition-all font-light tracking-wide"
              />
            </div>
            <button
              onClick={searchAddress}
              disabled={isSearching}
              className="w-full bg-white hover:bg-neutral-200 text-black font-medium py-3.5 px-4 rounded-none shadow-[0_4px_20px_rgba(255,255,255,0.15)] active:scale-[0.99] transition-all disabled:opacity-50 tracking-wide flex justify-center items-center gap-2 uppercase text-xs"
            >
              {isSearching ? "Locating..." : "Find Origin"}
            </button>
          </div>
          
          {searchResults.length > 0 && (
            <div className="bg-neutral-900/80 border border-white/10 shadow-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => selectAddress(result)}
                  className="w-full text-left px-4 py-3.5 text-[11px] text-neutral-400 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0 truncate font-light tracking-wider uppercase"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedAddress && coordinates && (
          <div className="animate-fade-in-up flex flex-col gap-6 border-t border-white/10 pt-6 z-10 pointer-events-auto">
            
            {/* View Mode Toggle */}
            <div className="flex bg-neutral-900/50 p-1 border border-white/10 rounded-sm">
              <button
                onClick={() => setViewMode("normal")}
                className={`flex-1 py-2 text-xs uppercase tracking-widest font-medium transition-all ${viewMode === 'normal' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-white'}`}
              >
                Normal
              </button>
              <button
                onClick={() => setViewMode("satellite")}
                className={`flex-1 py-2 text-xs uppercase tracking-widest font-medium transition-all ${viewMode === 'satellite' ? 'bg-white text-black shadow-sm' : 'text-neutral-500 hover:text-white'}`}
              >
                Satellite
              </button>
            </div>

            <div>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-neutral-500 rounded-full inline-block" /> Selected Region
              </p>
              <p className="text-sm text-neutral-200 leading-relaxed line-clamp-2 font-light">{selectedAddress}</p>
              <div className="mt-4 inline-flex items-center gap-3 text-[10px] text-neutral-400 font-mono bg-neutral-900/80 py-1.5 px-3 border border-white/10">
                <span className="text-white/80">LAT {coordinates.lat.toFixed(4)}</span>
                <span className="text-white/20">|</span>
                <span className="text-white/80">LNG {coordinates.lng.toFixed(4)}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setShowMapTools(!showMapTools);
                if (!showMapTools) setViewMode("satellite"); // switch to satellite when tools enabled
              }}
              className={`w-full py-4 text-xs font-semibold tracking-widest uppercase border transition-all active:scale-[0.99] flex justify-center items-center gap-3 shadow-lg ${
                showMapTools
                  ? "bg-transparent border-white/30 text-white hover:bg-white/5"
                  : "bg-white border-white text-black hover:bg-neutral-200"
              }`}
            >
              {showMapTools ? (
                <>Disable Workspace</>
              ) : (
                <>Enable Workspace</>
              )}
            </button>

            {showMapTools && (
              <div className="animate-fade-in-up border border-white/10 bg-neutral-900/30 p-5 mt-2 flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-px bg-white/10 border border-white/10">
                  <div className="bg-neutral-950 p-4 flex flex-col items-center justify-center">
                    <span className="text-2xl font-light text-white">{roofElements.length}</span>
                    <span className="text-[9px] text-neutral-500 font-medium uppercase tracking-widest mt-1">Shapes</span>
                  </div>
                  <div className="bg-neutral-950 p-4 flex flex-col items-center justify-center">
                    <span className="text-2xl font-light text-white">{obstacleMarkers.length}</span>
                    <span className="text-[9px] text-neutral-500 font-medium uppercase tracking-widest mt-1">Markers</span>
                  </div>
                </div>
                
                <button
                  onClick={exportRoofData}
                  className="w-full bg-transparent border border-neutral-700 hover:border-white/50 text-neutral-300 font-medium tracking-widest uppercase text-[10px] py-3 transition-all flex justify-center items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Export Data
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 p-6 flex flex-col relative w-full h-screen">
        {!coordinates ? (
          <div className="flex-1 flex items-center justify-center z-10 animate-fade-in">
            <div className="flex flex-col items-center gap-6 max-w-sm text-center">
              <div className="w-16 h-16 border border-white/20 bg-neutral-900/50 flex items-center justify-center rotate-45">
                <div className="w-6 h-6 border border-white/40 -rotate-45" />
              </div>
              <div>
                <h2 className="text-xl font-medium text-white tracking-[0.2em] uppercase mb-2">Awaiting Input</h2>
                <p className="text-neutral-500 font-light text-xs tracking-widest leading-relaxed uppercase">
                  Initialize location search to load satellite environment
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 border border-white/10 shadow-2xl relative z-10 isolate animate-fade-in bg-neutral-900">
            {/* Minimalist Top Bar */}
            <div className="absolute top-4 left-4 z-[500] pointer-events-none">
              <div className="bg-black/80 backdrop-blur-md border border-white/10 py-2 px-4 shadow-xl flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full bg-white opacity-40"></span>
                  <span className="relative inline-flex h-2 w-2 bg-white"></span>
                </span>
                <span className="text-white text-[10px] font-medium uppercase tracking-widest">{viewMode.toUpperCase()} VIEW ACTIVE</span>
              </div>
            </div>
            
            {/* View container switches between Leaflet and MapCN dynamically */}
            <div className={`w-full h-full relative ${viewMode === 'satellite' ? 'opacity-100 z-10' : 'opacity-0 z-0 hidden'} transition-opacity duration-300`}>
               <div ref={mapContainerRef} className="w-full h-full bg-black grayscale contrast-125" />
            </div>

            <div className={`w-full h-full absolute inset-0 ${viewMode === 'normal' ? 'opacity-100 z-10' : 'opacity-0 z-0 hidden'} transition-opacity duration-300`}>
               <Map center={[coordinates.lng, coordinates.lat]} zoom={18} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* Global Reset */
        body, html { background: #0a0a0a; color: #fff; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
        
        @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in-down { 0% { opacity: 0; transform: translateY(-15px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        
        .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
        .animate-fade-in-down { animation: fade-in-down 0.5s ease-out forwards; }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
        
        /* Minimalist Leaflet Theme */
        .leaflet-container { font-family: inherit !important; background: #000 !important; }
        .leaflet-control-zoom, .leaflet-draw-toolbar {
          border: 1px solid rgba(255,255,255,0.15) !important;
          border-radius: 0 !important;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .leaflet-control-zoom a, .leaflet-draw-toolbar a {
          background-color: #0a0a0a !important;
          color: #fff !important;
          border-color: rgba(255,255,255,0.05) !important;
          border-radius: 0 !important;
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
          transition: background 0.2s;
        }
        .leaflet-control-zoom a:hover, .leaflet-draw-toolbar a:hover {
          background-color: #262626 !important;
          color: #fff !important;
        }
        
        /* Make Esri map black/white */
        .leaflet-layer {
          filter: grayscale(100%) contrast(1.2) brightness(0.9);
        }
        
        /* Tooltip */
        .monochrome-tooltip {
          background: #000;
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 0;
          font-family: inherit;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .leaflet-tooltip-top:before { border-top-color: #000; }
        
        .leaflet-interactive {
          stroke: #ffffff !important;
          stroke-width: 2px !important;
        }
        
        /* Hide text selection on canvas */
        .leaflet-container { user-select: none; }
      `}</style>
    </div>
  );
}
