import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-draw";
import { circle as turfCircle } from "@turf/turf";
import { createPanelFeatureAtCenter, validatePanelPlacement } from "@/lib/panelLayout";
import { SolarHeatmap } from "@/lib/solarHeatmap";
import {
  AutoRoofDetectionResult,
  Coordinates,
  ObstacleMarker,
  PanelLayoutContext,
  PanelLayoutMode,
  PanelTypeId,
  PlacedPanel,
  RoofElement,
} from "@/types";

type PanelInteractionConfig = {
  context: PanelLayoutContext;
  mode: PanelLayoutMode;
  selectedPanelTypeId: PanelTypeId;
  alignmentAngleDegrees: number;
  placedPanels: PlacedPanel[];
  onPlacePanel: (feature: GeoJSON.Feature<GeoJSON.Polygon>) => void;
};

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

function hasActiveDrawTool(map: L.Map) {
  return Boolean(map.getContainer().querySelector(".leaflet-draw-toolbar a.leaflet-draw-toolbar-button-enabled"));
}

function serializeLayerToGeoJSON(layer: L.Layer): GeoJSON.Feature {
  if (layer instanceof L.Circle) {
    const position = layer.getLatLng();
    return turfCircle([position.lng, position.lat], layer.getRadius() / 1000, {
      units: "kilometers",
      steps: 48,
    }) as GeoJSON.Feature<GeoJSON.Polygon>;
  }

  return (layer as L.Polygon | L.Polyline | L.Marker).toGeoJSON() as GeoJSON.Feature;
}

function createManualPreviewStyle(isValid: boolean): L.PathOptions {
  return isValid
    ? {
        color: "#bbf7d0",
        weight: 2,
        opacity: 0.95,
        fillColor: "#16a34a",
        fillOpacity: 0.25,
        dashArray: "5, 4",
        interactive: false,
        bubblingMouseEvents: false,
      }
    : {
        color: "#fecaca",
        weight: 2,
        opacity: 0.95,
        fillColor: "#dc2626",
        fillOpacity: 0.28,
        dashArray: "5, 4",
        interactive: false,
        bubblingMouseEvents: false,
      };
}

export function useLeafletDraw(
  coordinates: Coordinates | null,
  viewMode: "normal" | "satellite",
  showMapTools: boolean,
  setRoofElements: React.Dispatch<React.SetStateAction<RoofElement[]>>,
  setObstacleMarkers: React.Dispatch<React.SetStateAction<ObstacleMarker[]>>,
  solarHeatmap: SolarHeatmap | null,
  panelInteraction: PanelInteractionConfig
) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatmapGroupRef = useRef<L.FeatureGroup | null>(null);
  const panelGroupRef = useRef<L.FeatureGroup | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const previewGroupRef = useRef<L.FeatureGroup | null>(null);
  const manualPreviewGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);
  const monochromeLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const { context, mode, selectedPanelTypeId, alignmentAngleDegrees, placedPanels, onPlacePanel } = panelInteraction;

  const getGeometryType = (layer: L.Layer) => {
    if (layer instanceof L.Rectangle) return "rectangle";
    if (layer instanceof L.Circle) return "circle";
    if (layer instanceof L.Polygon) return "polygon";
    if (layer instanceof L.Polyline) return "polyline";
    if (layer instanceof L.Marker) return "marker";
    return "unknown";
  };

  const handleDrawCreated = useCallback((e: { layerType: string; layer: L.Layer }) => {
    if (!featureGroupRef.current) return;
    const { layerType, layer } = e;
    featureGroupRef.current.addLayer(layer);
    const id = featureGroupRef.current.getLayerId(layer);

    if (layerType === "marker" && layer instanceof L.Marker) {
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

    const geoJSON = serializeLayerToGeoJSON(layer);
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

  const handleDrawEdited = useCallback((e: { layers: L.LayerGroup }) => {
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
        prev.map((el) => (el.layerId === id ? { ...el, geoJSON: serializeLayerToGeoJSON(layer) } : el))
      );
    });
  }, [setObstacleMarkers, setRoofElements]);

  const handleDrawDeleted = useCallback((e: { layers: L.LayerGroup }) => {
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

      const monochromeTiles = L.tileLayer(
        "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 20,
          subdomains: "abcd",
          crossOrigin: "anonymous",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
        }
      );
      const esriImagery = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, crossOrigin: "anonymous" }
      );

      monochromeLayerRef.current = monochromeTiles;
      satelliteLayerRef.current = esriImagery;

      if (viewMode === "satellite") {
        esriImagery.addTo(map);
      } else {
        monochromeTiles.addTo(map);
      }

      const heatmapItems = new L.FeatureGroup();
      const panelItems = new L.FeatureGroup();
      const drawnItems = new L.FeatureGroup();
      const previewItems = new L.FeatureGroup();
      const manualPreviewItems = new L.FeatureGroup();
      map.addLayer(heatmapItems);
      map.addLayer(panelItems);
      map.addLayer(drawnItems);
      map.addLayer(previewItems);
      map.addLayer(manualPreviewItems);
      mapRef.current = map;
      heatmapGroupRef.current = heatmapItems;
      panelGroupRef.current = panelItems;
      featureGroupRef.current = drawnItems;
      previewGroupRef.current = previewItems;
      manualPreviewGroupRef.current = manualPreviewItems;
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
  }, [coordinates, viewMode]);

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
    const map = mapRef.current;
    const monochromeLayer = monochromeLayerRef.current;
    const satelliteLayer = satelliteLayerRef.current;

    if (!map || !monochromeLayer || !satelliteLayer) {
      return;
    }

    if (viewMode === "satellite") {
      if (!map.hasLayer(satelliteLayer)) {
        satelliteLayer.addTo(map);
      }
      if (map.hasLayer(monochromeLayer)) {
        map.removeLayer(monochromeLayer);
      }
    } else {
      if (!map.hasLayer(monochromeLayer)) {
        monochromeLayer.addTo(map);
      }
      if (map.hasLayer(satelliteLayer)) {
        map.removeLayer(satelliteLayer);
      }
    }

    setTimeout(() => map.invalidateSize(), 100);
  }, [viewMode]);

  useEffect(() => {
    setupMapIfNeeded();
  }, [setupMapIfNeeded]);

  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      map.off();
      map.remove();
      mapRef.current = null;
      heatmapGroupRef.current = null;
      panelGroupRef.current = null;
      featureGroupRef.current = null;
      previewGroupRef.current = null;
      manualPreviewGroupRef.current = null;
      drawControlRef.current = null;
      locationMarkerRef.current = null;
      monochromeLayerRef.current = null;
      satelliteLayerRef.current = null;
    };
  }, []);

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
    const panelGroup = panelGroupRef.current;
    if (!panelGroup) {
      return;
    }

    panelGroup.clearLayers();

    placedPanels.forEach((panel) => {
      const layer = L.polygon(toLatLngRing(panel.feature.geometry.coordinates[0]), {
        color: "#dbeafe",
        weight: 1,
        opacity: 0.95,
        fillColor: "#123f97",
        fillOpacity: panel.source === "manual" ? 0.72 : 0.58,
        interactive: false,
        bubblingMouseEvents: false,
      });
      panelGroup.addLayer(layer);
    });
  }, [placedPanels]);

  useEffect(() => {
    const map = mapRef.current;
    const manualPreviewGroup = manualPreviewGroupRef.current;
    if (!map || !manualPreviewGroup) {
      return;
    }

    const container = map.getContainer();
    let previewLayer: L.Polygon | null = null;

    const clearPreview = () => {
      manualPreviewGroup.clearLayers();
      previewLayer = null;
    };

    if (!showMapTools || viewMode !== "satellite" || mode !== "manual") {
      clearPreview();
      container.style.cursor = "";
      return;
    }

    const renderPreview = (latlng: L.LatLng) => {
      if (hasActiveDrawTool(map)) {
        clearPreview();
        container.style.cursor = "";
        return;
      }

      container.style.cursor = "crosshair";
      const candidate = createPanelFeatureAtCenter(
        { lat: latlng.lat, lng: latlng.lng },
        selectedPanelTypeId,
        alignmentAngleDegrees
      );
      const validation = validatePanelPlacement(
        candidate,
        context,
        placedPanels.map((panel) => panel.feature)
      );
      const previewLatLngs = toLatLngRing(candidate.geometry.coordinates[0]);
      const previewStyle = createManualPreviewStyle(validation.isValid);

      if (!previewLayer) {
        previewLayer = L.polygon(previewLatLngs, previewStyle);
        manualPreviewGroup.addLayer(previewLayer);
        return;
      }

      previewLayer.setLatLngs(previewLatLngs as L.LatLngExpression[]);
      previewLayer.setStyle(previewStyle);
    };

    const handleMouseMove = (event: L.LeafletMouseEvent) => {
      renderPreview(event.latlng);
    };

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (hasActiveDrawTool(map)) {
        return;
      }

      const candidate = createPanelFeatureAtCenter(
        { lat: event.latlng.lat, lng: event.latlng.lng },
        selectedPanelTypeId,
        alignmentAngleDegrees
      );
      const validation = validatePanelPlacement(
        candidate,
        context,
        placedPanels.map((panel) => panel.feature)
      );

      if (validation.isValid) {
        onPlacePanel(candidate);
        return;
      }

      renderPreview(event.latlng);
    };

    const handleMouseLeave = () => {
      clearPreview();
    };

    map.on("mousemove", handleMouseMove);
    map.on("click", handleMapClick);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("click", handleMapClick);
      container.removeEventListener("mouseleave", handleMouseLeave);
      container.style.cursor = "";
      clearPreview();
    };
  }, [alignmentAngleDegrees, context, mode, onPlacePanel, placedPanels, selectedPanelTypeId, showMapTools, viewMode]);

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
