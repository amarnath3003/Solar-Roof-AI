import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-draw";
import { Coordinates, RoofElement, ObstacleMarker } from "@/types";

export function useLeafletDraw(
  coordinates: Coordinates | null,
  viewMode: "normal" | "satellite",
  showMapTools: boolean,
  setRoofElements: React.Dispatch<React.SetStateAction<RoofElement[]>>,
  setObstacleMarkers: React.Dispatch<React.SetStateAction<ObstacleMarker[]>>
) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);

  const getGeometryType = (layer: L.Layer) => {
    if (layer instanceof L.Polygon) return "polygon";
    if (layer instanceof L.Rectangle) return "rectangle";
    if (layer instanceof L.Circle) return "circle";
    if (layer instanceof L.Polyline) return "polyline";
    if (layer instanceof L.Marker) return "marker";
    return "unknown";
  };

  const handleDrawCreated = useCallback((e: any) => {
    if (!featureGroupRef.current) return;
    const { layerType, layer } = e;
    featureGroupRef.current.addLayer(layer);
    const id = featureGroupRef.current.getLayerId(layer);

    if (layerType === "marker") {
      const position = layer.getLatLng();
      setObstacleMarkers((prev) => [
        ...prev,
        { id: Date.now(), layerId: id, type: "obstacle", position: [position.lat, position.lng], label: "Obstacle" },
      ]);
      layer.bindTooltip("Obstacle", { direction: "top", className: "monochrome-tooltip" });
      return;
    }

    const geoJSON = layer.toGeoJSON();
    setRoofElements((prev) => [
      ...prev,
      {
        id: Date.now(),
        layerId: id,
        type: getGeometryType(layer),
        geoJSON,
        style: { color: "#ffffff" },
      },
    ]);
  }, [setObstacleMarkers, setRoofElements]);

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
  }, [setObstacleMarkers, setRoofElements]);

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
  }, [setObstacleMarkers, setRoofElements]);

  const setupMapIfNeeded = useCallback(() => {
    if (!coordinates || !mapContainerRef.current) return;
    if (!mapRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
      // @ts-ignore
      const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: false, tap: false }).setView(
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
        draw: {
          polyline: { shapeOptions: { color: "#ffffff", weight: 2, opacity: 0.8, dashArray: "4, 6" } },
          polygon: {
            allowIntersection: true,
            shapeOptions: { color: "#ffffff", weight: 2, opacity: 0.8, fill: true, fillColor: "#ffffff", fillOpacity: 0.1 },
          },
          circle: { shapeOptions: { color: "#ffffff", weight: 2, opacity: 0.8, fill: true, fillColor: "#ffffff", fillOpacity: 0.1 } },
          rectangle: { shapeOptions: { color: "#ffffff", weight: 2, opacity: 0.8, fill: true, fillColor: "#ffffff", fillOpacity: 0.1 } },
          marker: {
            icon: L.divIcon({
              className: "custom-monochrome-marker",
              html: `<div class="w-4 h-4 bg-white rounded-full border-[3px] border-black shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          },
          circlemarker: false,
        },
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

  return { mapContainerRef, mapRef, featureGroupRef };
}
