import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-draw";
import { SolarHeatmap } from "@/lib/solarHeatmap";
import { SunProjection } from "@/lib/sunProjection";
import { AutoRoofDetectionResult, Coordinates, RoofElement, ObstacleMarker } from "@/types";

function createObstacleIcon() {
  return L.divIcon({
    className: "custom-monochrome-marker",
    html: `<div class="w-4 h-4 bg-white rounded-full border-[3px] border-black shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function toLatLngRing(ring: number[][]): L.LatLngExpression[] {
  const normalizedRing =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, ring.length - 1)
      : ring;

  return normalizedRing.map((point) => [point[1], point[0]] as [number, number]);
}

export function useLeafletDraw(
  coordinates: Coordinates | null,
  viewMode: "normal" | "satellite",
  showMapTools: boolean,
  setRoofElements: React.Dispatch<React.SetStateAction<RoofElement[]>>,
  setObstacleMarkers: React.Dispatch<React.SetStateAction<ObstacleMarker[]>>,
  sunProjection: SunProjection | null,
  solarHeatmap: SolarHeatmap | null
) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatmapGroupRef = useRef<L.FeatureGroup | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const previewGroupRef = useRef<L.FeatureGroup | null>(null);
  const sunPathGroupRef = useRef<L.FeatureGroup | null>(null);
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
        {
          id: Date.now(),
          layerId: id,
          type: "obstacle",
          position: [position.lat, position.lng],
          label: "Obstacle",
          source: "manual",
        },
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
        source: "manual",
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
        { maxZoom: 21, crossOrigin: "anonymous" }
      );
      esriImagery.addTo(map);

      const heatmapItems = new L.FeatureGroup();
      const drawnItems = new L.FeatureGroup();
      const previewItems = new L.FeatureGroup();
      const sunPathItems = new L.FeatureGroup();
      map.addLayer(heatmapItems);
      map.addLayer(drawnItems);
      map.addLayer(previewItems);
      map.addLayer(sunPathItems);
      mapRef.current = map;
      heatmapGroupRef.current = heatmapItems;
      featureGroupRef.current = drawnItems;
      previewGroupRef.current = previewItems;
      sunPathGroupRef.current = sunPathItems;
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
            icon: createObstacleIcon(),
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

  useEffect(() => {
    const heatmapGroup = heatmapGroupRef.current;
    if (!heatmapGroup) {
      return;
    }

    heatmapGroup.clearLayers();

    if (!solarHeatmap) {
      return;
    }

    solarHeatmap.cells.forEach((cell) => {
      const layer = L.polygon(
        cell.corners.map((point) => [point.lat, point.lng] as [number, number]),
        {
          stroke: false,
          fillColor: cell.fillColor,
          fillOpacity: cell.fillOpacity,
          interactive: false,
          bubblingMouseEvents: false,
        }
      );
      heatmapGroup.addLayer(layer);
    });
  }, [solarHeatmap]);

  useEffect(() => {
    const sunPathGroup = sunPathGroupRef.current;
    if (!sunPathGroup) {
      return;
    }

    sunPathGroup.clearLayers();

    if (!sunProjection) {
      return;
    }

    const centerLatLng: L.LatLngExpression = [sunProjection.center.lat, sunProjection.center.lng];
    const endpointLatLng: L.LatLngExpression = [sunProjection.endpoint.lat, sunProjection.endpoint.lng];
    const opacity = sunProjection.isAboveHorizon ? 0.9 : 0.4;

    const ray = L.polyline([centerLatLng, endpointLatLng], {
      color: "#facc15",
      weight: 6,
      opacity,
      dashArray: "12, 10",
      interactive: false,
    });
    const centerMarker = L.circleMarker(centerLatLng, {
      radius: 5,
      color: "#fde68a",
      fillColor: "#facc15",
      fillOpacity: opacity,
      opacity,
      weight: 2,
      interactive: false,
    });

    sunPathGroup.addLayer(ray);
    sunPathGroup.addLayer(centerMarker);
  }, [sunProjection]);

  const clearDetectionPreview = useCallback(() => {
    previewGroupRef.current?.clearLayers();
  }, []);

  const showDetectionPreview = useCallback((result: AutoRoofDetectionResult) => {
    if (!previewGroupRef.current) return;

    previewGroupRef.current.clearLayers();

    result.roofPlanes.forEach((plane) => {
      const ring = plane.geometry.coordinates[0];
      if (!ring || ring.length < 4) return;

      const layer = L.polygon(toLatLngRing(ring), {
        color: "#22d3ee",
        weight: 2,
        opacity: 0.9,
        fillColor: "#22d3ee",
        fillOpacity: 0.18,
        dashArray: "7, 5",
        interactive: false,
      });
      layer.bindTooltip(
        `Roof ${(plane.confidence * 100).toFixed(0)}% | ${plane.estimatedPitchDegrees.toFixed(1)}deg`,
        {
          direction: "top",
          className: "monochrome-tooltip",
        }
      );
      previewGroupRef.current?.addLayer(layer);
    });

    result.obstacles.forEach((obstacle) => {
      const [lng, lat] = obstacle.geometry.coordinates;
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#f97316",
        fillColor: "#f97316",
        fillOpacity: 0.9,
        weight: 2,
        interactive: false,
      });
      marker.bindTooltip(`Obstacle ${(obstacle.confidence * 100).toFixed(0)}%`, {
        direction: "top",
        className: "monochrome-tooltip",
      });
      previewGroupRef.current?.addLayer(marker);
    });
  }, []);

  const acceptDetectionPreview = useCallback((result: AutoRoofDetectionResult) => {
    if (!featureGroupRef.current) return;

    const createdRoofElements: RoofElement[] = [];
    const createdObstacles: ObstacleMarker[] = [];

    result.roofPlanes.forEach((plane) => {
      const ring = plane.geometry.coordinates[0];
      if (!ring || ring.length < 4) return;

      const polygonLayer = L.polygon(toLatLngRing(ring), {
        color: "#ffffff",
        weight: 2,
        opacity: 0.8,
        fillColor: "#ffffff",
        fillOpacity: 0.1,
      });
      featureGroupRef.current?.addLayer(polygonLayer);
      const layerId = featureGroupRef.current?.getLayerId(polygonLayer) ?? Date.now();

      createdRoofElements.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        layerId,
        type: "polygon",
        geoJSON: polygonLayer.toGeoJSON() as GeoJSON.Feature,
        style: { color: "#ffffff" },
        source: "auto-detected",
        confidence: plane.confidence,
        slope: {
          pitchDegrees: plane.estimatedPitchDegrees,
          aspectDegrees: plane.aspectDegrees,
        },
      });
    });

    result.obstacles.forEach((obstacle) => {
      const [lng, lat] = obstacle.geometry.coordinates;
      const markerLayer = L.marker([lat, lng], { icon: createObstacleIcon() });
      featureGroupRef.current?.addLayer(markerLayer);
      markerLayer.bindTooltip("Obstacle", { direction: "top", className: "monochrome-tooltip" });
      const layerId = featureGroupRef.current?.getLayerId(markerLayer) ?? Date.now();

      createdObstacles.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        layerId,
        type: "obstacle",
        position: [lat, lng],
        label: obstacle.obstacleType,
        source: "auto-detected",
        confidence: obstacle.confidence,
        estimatedHeightM: obstacle.estimatedHeightM,
      });
    });

    if (createdRoofElements.length > 0) {
      setRoofElements((previous) => [...previous, ...createdRoofElements]);
    }
    if (createdObstacles.length > 0) {
      setObstacleMarkers((previous) => [...previous, ...createdObstacles]);
    }

    previewGroupRef.current?.clearLayers();
  }, [setObstacleMarkers, setRoofElements]);

  return {
    mapContainerRef,
    mapRef,
    featureGroupRef,
    showDetectionPreview,
    clearDetectionPreview,
    acceptDetectionPreview,
  };
}
