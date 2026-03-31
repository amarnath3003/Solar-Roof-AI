import React, { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

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
      style: { color: layerType === "polygon" || layerType === "rectangle" ? "#3b82f6" : layerType === "circle" ? "#22c55e" : "#ef4444" },
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
      const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([coordinates.lat, coordinates.lng], 20);
      const esriImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 21, attribution: "Tiles &copy; Esri" });
      const osmStreets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "&copy; OpenStreetMap" });
      esriImagery.addTo(map);
      L.control.layers({ "Satellite (Esri)": esriImagery, OpenStreetMap: osmStreets }, undefined, { position: "topright" }).addTo(map);
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      mapRef.current = map;
      featureGroupRef.current = drawnItems;
    }
    mapRef.current.setView([coordinates.lat, coordinates.lng], 20);
    if (locationMarkerRef.current) mapRef.current.removeLayer(locationMarkerRef.current);
    const locationMarker = L.circleMarker([coordinates.lat, coordinates.lng], { radius: 6, color: "#10b981", fillColor: "#10b981", fillOpacity: 0.8 });
    locationMarker.bindTooltip("Selected address", { direction: "top" }).addTo(mapRef.current);
    locationMarkerRef.current = locationMarker;
    setTimeout(() => mapRef.current?.invalidateSize(), 100);
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

  useEffect(() => { setupMapIfNeeded(); }, [setupMapIfNeeded]);
  useEffect(() => { syncDrawTools(); }, [syncDrawTools]);
  useEffect(() => { return () => { if (mapRef.current) mapRef.current.remove(); }; }, []);

  const searchAddress = async () => {
    const query = address.trim();
    if (!query) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`);
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
    a.download = "roof_data.geojson";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 font-sans text-slate-100 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none" />
      
      {/* Glassmorphic Sidebar */}
      <div className="w-[380px] flex-shrink-0 bg-white/5 backdrop-blur-xl border-r border-white/10 p-6 flex flex-col gap-6 overflow-y-auto z-10 shadow-2xl transition-all duration-300">
        
        <div className="text-center animate-fade-in-down mb-2">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-2xl shadow-[0_0_20px_rgba(34,211,238,0.4)] flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400 mb-1 drop-shadow-sm tracking-tight">
            SolarRoof AI
          </h1>
          <p className="text-xs text-indigo-200/60 font-medium tracking-widest uppercase">
            Precision Solar Mapping
          </p>
        </div>

        {/* Search Section */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md transition-all hover:bg-white/[0.07]">
          <h3 className="text-xs font-bold text-cyan-300/80 mb-3 uppercase tracking-widest flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
            Location Search
          </h3>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchAddress(); }}
                placeholder="Enter an address..."
                className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-slate-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/30 transition-all shadow-inner"
              />
            </div>
            <button
              onClick={searchAddress}
              disabled={isSearching}
              className="w-full relative overflow-hidden group bg-gradient-to-r from-cyan-600/80 to-blue-700/80 hover:from-cyan-500 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-xl shadow-[0_4px_14px_0_rgba(6,-187,229,0.2)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 border border-white/10"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] skew-x-[-30deg] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out" />
              {isSearching ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Search Location"
              )}
            </button>
          </div>
          
          {searchResults.length > 0 && (
            <div className="mt-4 bg-black/40 border border-white/10 rounded-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => selectAddress(result)}
                  className="w-full text-left px-4 py-3 text-xs text-slate-300 hover:bg-cyan-500/20 hover:text-white transition-colors border-b border-white/5 last:border-0 truncate"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Location */}
        {selectedAddress && coordinates && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md animate-fade-in-up">
            <h3 className="text-xs font-bold text-cyan-300/80 mb-3 uppercase tracking-widest flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
              Target Region
            </h3>
            <p className="text-sm text-slate-200 leading-relaxed mb-3 line-clamp-2" title={selectedAddress}>{selectedAddress}</p>
            <div className="inline-flex items-center gap-3 text-xs text-slate-300 font-mono bg-black/30 py-2 px-3 rounded-lg border border-white/5 shadow-inner">
              <span className="flex items-center gap-1"><span className="text-cyan-400">Lat:</span> {coordinates.lat.toFixed(5)}</span>
              <span className="text-white/20">|</span>
              <span className="flex items-center gap-1"><span className="text-blue-400">Lng:</span> {coordinates.lng.toFixed(5)}</span>
            </div>
          </div>
        )}

        {/* Draw Tools Toggle */}
        {coordinates && (
          <button
            onClick={() => setShowMapTools(!showMapTools)}
            className={`w-full py-4 px-4 rounded-xl font-bold shadow-lg transition-all active:scale-[0.98] animate-fade-in-up flex justify-center items-center gap-2 border ${
              showMapTools
                ? "bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border-rose-500/30 shadow-[0_4px_20px_rgba(225,29,72,0.1)]"
                : "bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.1)]"
            }`}
          >
            {showMapTools ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                Disable Mapping Tools
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M15.388 5.437l-4.706-4.706a1 1 0 00-1.414 0l-5.83 5.83a1 1 0 00-.293.707v5.83a1 1 0 00.293.707l5.83 5.83a1 1 0 001.414 0l4.706-4.706a1 1 0 000-1.414l-5.83-5.83a1 1 0 00-1.414 0l-3.293 3.293M9 13a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" /></svg>
                Enable Mapping Tools
              </>
            )}
          </button>
        )}

        {/* Element Summary & Export */}
        {showMapTools && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md animate-fade-in-up flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-bold text-cyan-300/80 mb-3 uppercase tracking-widest">Capture Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-xl p-3 border border-white/5 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-400 to-indigo-500 drop-shadow-sm">{roofElements.length}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Structures</span>
                </div>
                <div className="bg-black/30 rounded-xl p-3 border border-white/5 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-rose-400 to-red-500 drop-shadow-sm">{obstacleMarkers.length}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Obstacles</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={exportRoofData}
              className="w-full bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/30 font-bold py-3 px-4 rounded-xl shadow-[0_4px_14px_0_rgba(16,185,129,0.1)] active:scale-[0.98] transition-all flex justify-center items-center gap-2 mt-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Export JSON
            </button>
          </div>
        )}
      </div>

      {/* Main Map Area */}
      <div className="flex-1 p-6 pl-2 flex flex-col relative w-full h-[calc(100vh-2rem)] my-4 mr-4">
        {/* Decorative Background Elements behind map */}
        <div className="absolute top-[10%] left-[20%] w-[30%] h-[30%] bg-blue-500/30 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[40%] h-[40%] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>

        {!coordinates ? (
          <div className="flex-1 flex flex-col items-center justify-center z-10 animate-fade-in-up">
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-12 rounded-[2rem] shadow-2xl max-w-lg text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/20 rounded-bl-[100px] blur-2xl" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/20 rounded-tr-[100px] blur-2xl" />
              
              <div className="w-24 h-24 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 border border-white/20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-[0_0_40px_rgba(6,187,229,0.2)] rotate-3 backdrop-blur-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-cyan-300 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-black text-white mb-4 tracking-tight">System Ready</h2>
              <p className="text-slate-300 leading-relaxed mb-6 text-sm font-medium">
                Enter an address in the search panel to initialize the mapping sequence. High-resolution satellite imagery will be loaded for segment tracing.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 isolate ring-1 ring-white/20 flex flex-col">
            {/* Map overlay header */}
            <div className="absolute top-0 left-0 right-0 p-5 bg-gradient-to-b from-slate-900/90 via-slate-900/40 to-transparent z-[400] pointer-events-none flex justify-between items-start">
              <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-2 pointer-events-auto shadow-lg flex items-center gap-3">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </div>
                <span className="text-white/90 text-xs font-bold uppercase tracking-widest">Live View Active</span>
              </div>
            </div>
            
            <div ref={mapContainerRef} className="w-full flex-1 bg-slate-800" />
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in-down {
          0% {
            opacity: 0;
            transform: translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        
        /* Leaflet Controls Customization for Glassmorphism */
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background-color: rgba(30, 41, 59, 0.8) !important;
          color: rgba(255, 255, 255, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(12px) !important;
          transition: all 0.2s;
        }
        .leaflet-control-zoom a:hover {
          background-color: rgba(56, 189, 248, 0.2) !important;
          color: rgb(56, 189, 248) !important;
        }
        .leaflet-draw-toolbar {
          border: none !important;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
          border-radius: 8px !important;
          overflow: hidden;
        }
        .leaflet-draw-toolbar a {
          background-color: rgba(30, 41, 59, 0.8) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(12px) !important;
          transition: all 0.2s;
        }
        .leaflet-draw-toolbar a:hover {
          background-color: rgba(56, 189, 248, 0.2) !important;
        }
        .leaflet-control-layers {
          background-color: rgba(15, 23, 42, 0.8) !important;
          color: rgba(226, 232, 240, 1) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(12px) !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
        }
        .leaflet-control-layers-list label {
          color: rgba(226, 232, 240, 0.9) !important;
        }
      `}</style>
    </div>
  );
}
