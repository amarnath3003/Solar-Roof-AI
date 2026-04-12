import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { MainHeader } from "@/components/Layout";
import { WorkspaceContent } from "@/components/Workspace";
import { useAutoRoofDetection } from "@/hooks/useAutoRoofDetection";
import { useAddressSearch } from "@/hooks/useAddressSearch";
import { useLeafletDraw } from "@/hooks/useLeafletDraw";
import { usePanelLayoutWorker } from "@/hooks/usePanelLayoutWorker";
import { SolarFinancialInputs, useSolarFinancials } from "@/hooks/useSolarFinancials";
import { captureMapSnapshot } from "@/lib/mapSnapshot";
import {
  PANEL_TYPES,
  buildPanelLayoutContext,
  getRoofOutlineAlignmentAngleDegrees,
  validatePanelPlacement,
} from "@/lib/panelLayout";
import { calculateRoofAreaSummary } from "@/lib/roofArea";
import { calculateSolarHeatmap } from "@/lib/solarHeatmap";
import { getActiveRoofFootprint } from "@/lib/sunProjection";
import "@/styles/leaflet-custom.css";
import {
  AutoRoofDetectionResult,
  ObstacleMarker,
  PanelLayoutMode,
  PanelTypeId,
  PlacedPanel,
  RoofAreaSummary,
  RoofElement,
  ViewMode,
} from "@/types";

type PlannerSyncState = "estimate" | "paused" | "syncing" | "synced" | "error";

const DEFAULT_PLANNER_INPUTS: SolarFinancialInputs = {
  // EIA residential monthly bill baseline.
  monthlyBill: 142.26,
  // Default panel capacity follows the default panel type.
  panelCapacityWatts: 400,
  // Rounded current U.S. residential utility-rate baseline.
  energyCostPerKwh: 0.18,
  // National default is zero; local rebates can be entered manually.
  solarIncentiveAmount: 0,
  // NREL residential PV benchmark baseline.
  costPerWatt: 2.9,
};

const PANEL_CAPACITY_BY_TYPE: Record<PanelTypeId, number> = {
  "standard-residential": 400,
  "large-commercial": 450,
};

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function downloadRoofData(roofElements: RoofElement[], obstacleMarkers: ObstacleMarker[]) {
  const featureCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      ...roofElements.map(
        (element) =>
          ({
            ...element.geoJSON,
            properties: {
              ...(element.geoJSON.properties ?? {}),
              elementType: element.type,
              style: element.style,
              source: element.source,
              confidence: element.confidence,
              slope: element.slope,
            },
          }) as GeoJSON.Feature
      ),
      ...obstacleMarkers.map(
        (marker) =>
          ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [marker.position[1], marker.position[0]],
            },
            properties: {
              type: marker.type,
              label: marker.label,
              source: marker.source,
              confidence: marker.confidence,
              estimatedHeightM: marker.estimatedHeightM,
            },
          }) as GeoJSON.Feature
      ),
    ],
  };

  const dataUrl = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(featureCollection, null, 2))}`;
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = "roof_monochrome_export.geojson";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createPlacedPanelRecord(
  feature: GeoJSON.Feature<GeoJSON.Polygon>,
  panelTypeId: PanelTypeId,
  source: "manual" | "auto"
): PlacedPanel {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    panelTypeId,
    source,
    feature,
  };
}

function logDevPerf(label: string, durationMs: number, detail: string) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(`[perf] ${label}: ${durationMs.toFixed(1)}ms | ${detail}`);
}

export default function App() {
  const [roofElements, setRoofElements] = useState<RoofElement[]>([]);
  const [obstacleMarkers, setObstacleMarkers] = useState<ObstacleMarker[]>([]);
  const [showMapTools, setShowMapTools] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("normal");
  const [detectionConfidenceThreshold, setDetectionConfidenceThreshold] = useState(0.45);
  const [detectionPreview, setDetectionPreview] = useState<AutoRoofDetectionResult | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [roofAreaSummary, setRoofAreaSummary] = useState<RoofAreaSummary | null>(null);
  const [roofAreaMessage, setRoofAreaMessage] = useState<string | null>(null);
  const [solarOverlayEnabled, setSolarOverlayEnabled] = useState(false);
  const [panelTypeId, setPanelTypeId] = useState<PanelTypeId>("standard-residential");
  const [panelLayoutMode, setPanelLayoutMode] = useState<PanelLayoutMode>("auto");
  const [panelTargetCount, setPanelTargetCount] = useState(25);
  const [panelTargetManuallySet, setPanelTargetManuallySet] = useState(false);
  const [layoutFinished, setLayoutFinished] = useState(false);
  const [placedPanels, setPlacedPanels] = useState<PlacedPanel[]>([]);
  const [panelLayoutMessage, setPanelLayoutMessage] = useState<string | null>(null);
  const [roofMaxPanelCount, setRoofMaxPanelCount] = useState<number | null>(null);
  const [plannerCapacityError, setPlannerCapacityError] = useState<string | null>(null);
  const [plannerInputs, setPlannerInputs] = useState<SolarFinancialInputs>(DEFAULT_PLANNER_INPUTS);
  const [plannerSyncState, setPlannerSyncState] = useState<PlannerSyncState>("estimate");
  const [plannerSyncMessage, setPlannerSyncMessage] = useState(
    "Enter an average monthly bill, then draw a primary roof polygon to turn the estimate into a live packed layout."
  );
  const plannerSyncRunRef = useRef(0);
  const capacityRunRef = useRef(0);

  const {
    address,
    setAddress,
    coordinates,
    searchResults,
    recentSearches,
    isSearching,
    selectAddress,
    handleSearchSubmit,
  } = useAddressSearch({
    onLocationSelected: () => {
      setViewMode("normal");
    },
  });

  const {
    detectFromSnapshot,
    isDetecting,
    error: detectionError,
    clearError: clearDetectionError,
  } = useAutoRoofDetection();
  const { runAutoPackTask, runCapacityTask } = usePanelLayoutWorker();

  const activeRoofFootprint = getActiveRoofFootprint(roofElements);
  const panelLayoutContext = useMemo(
    () => buildPanelLayoutContext(roofElements, obstacleMarkers),
    [roofElements, obstacleMarkers]
  );
  const placedPanelFeatures = useMemo(
    () => placedPanels.map((panel) => panel.feature),
    [placedPanels]
  );
  const estimatedPanelKw = useMemo(
    () => Number(((placedPanels.length * plannerInputs.panelCapacityWatts) / 1000).toFixed(1)),
    [placedPanels.length, plannerInputs.panelCapacityWatts]
  );
  const solarAnalysis = useMemo(
    () =>
      activeRoofFootprint
        ? calculateSolarHeatmap(activeRoofFootprint, {
            obstacleMarkers,
          })
        : null,
    [activeRoofFootprint, obstacleMarkers]
  );
  const solarHeatmap = solarOverlayEnabled ? solarAnalysis : null;
  const panelAlignmentAngleDegrees =
    getRoofOutlineAlignmentAngleDegrees(panelLayoutContext.primaryRoof) ??
    activeRoofFootprint?.slope?.aspectDegrees ??
    solarAnalysis?.alignmentAngleDegrees ??
    180;
  const hasPrimaryRoof = panelLayoutContext.primaryRoof !== null;
  const areaReady = (roofAreaSummary?.netSqFt ?? 0) > 0;
  const solarUnlocked = showMapTools && hasPrimaryRoof && layoutFinished && areaReady;
  const panelFootprintSqFt = PANEL_TYPES[panelTypeId].widthM * PANEL_TYPES[panelTypeId].heightM * 10.7639;
  const selectedPanelCount =
    solarUnlocked
      ? panelLayoutMode === "manual"
        ? placedPanels.length
        : panelTargetCount
      : null;
  const plannerFinancials = useSolarFinancials({
    ...plannerInputs,
    roofMaxPanelCount,
    roofNetSqFt: roofAreaSummary?.netSqFt ?? null,
    roofBlockedSqFt: roofAreaSummary?.blockedSqFt ?? null,
    selectedPanelCount,
    panelFootprintSqFt,
    performanceRatio: 0.82,
  });

  useEffect(() => {
    capacityRunRef.current += 1;
    const runId = capacityRunRef.current;

    if (!showMapTools || !layoutFinished || !panelLayoutContext.primaryRoof) {
      setRoofMaxPanelCount(null);
      setPlannerCapacityError(null);
      return;
    }

    setPlannerCapacityError(null);

    runCapacityTask({
      context: panelLayoutContext,
      panelTypeId,
      alignmentAngleDegrees: panelAlignmentAngleDegrees,
    })
      .then(({ payload, durationMs }) => {
        if (capacityRunRef.current !== runId) {
          return;
        }

        setRoofMaxPanelCount(payload.panelCount);
        logDevPerf("capacity-pack", durationMs, `maxPanels=${payload.panelCount}`);
      })
      .catch((error) => {
        if (capacityRunRef.current !== runId) {
          return;
        }

        if (import.meta.env.DEV) {
          console.error("Roof-aware planner capacity calculation failed.", error);
        }

        setRoofMaxPanelCount(null);
        setPlannerCapacityError(error instanceof Error ? error.message : "Planner capacity calculation failed.");
      });
  }, [layoutFinished, panelAlignmentAngleDegrees, panelLayoutContext, panelTypeId, runCapacityTask, showMapTools]);

  const handlePlaceManualPanel = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Polygon>) => {
      if (!validatePanelPlacement(feature, panelLayoutContext, placedPanelFeatures).isValid) {
        return;
      }

      setPlacedPanels((previous) => [...previous, createPlacedPanelRecord(feature, panelTypeId, "manual")]);
      setPanelLayoutMessage("Manual panel stamped into the current usable roof area.");
    },
    [panelLayoutContext, panelTypeId, placedPanelFeatures]
  );

  const handlePlannerInputChange = useCallback(
    (field: keyof SolarFinancialInputs, value: number, min: number, max: number) => {
      setPlannerInputs((current) => ({
        ...current,
        [field]: clampValue(value, min, max),
      }));
      setPanelTargetManuallySet(false);
    },
    []
  );

  const handlePanelTargetCountChange = useCallback((next: number) => {
    setPanelTargetManuallySet(true);
    setPanelTargetCount(Math.max(1, Math.floor(next)));
  }, []);

  const handlePanelTypeChange = useCallback((next: PanelTypeId) => {
    setPanelTypeId(next);
    setPlannerInputs((current) => ({
      ...current,
      panelCapacityWatts: PANEL_CAPACITY_BY_TYPE[next],
    }));
  }, []);

  const resetPlannerInputs = useCallback(() => {
    setPlannerInputs((current) => ({
      ...DEFAULT_PLANNER_INPUTS,
      panelCapacityWatts: PANEL_CAPACITY_BY_TYPE[panelTypeId],
    }));
    setPanelTargetManuallySet(false);
  }, [panelTypeId]);

  const {
    mapContainerRef,
    mapRef,
    featureGroupRef,
    showDetectionPreview,
    clearDetectionPreview,
    acceptDetectionPreview,
    isDrawToolActive,
  } = useLeafletDraw(
    coordinates,
    viewMode,
    showMapTools,
    setRoofElements,
    setObstacleMarkers,
    solarHeatmap,
    {
      context: panelLayoutContext,
      mode: panelLayoutMode,
      selectedPanelTypeId: panelTypeId,
      alignmentAngleDegrees: panelAlignmentAngleDegrees,
      placedPanels,
      onPlacePanel: handlePlaceManualPanel,
    }
  );

  const solarUnlockMessage = useMemo(() => {
    if (!hasPrimaryRoof) {
      return "Draw a primary roof polygon to start solar potential analysis.";
    }

    if (isDrawToolActive) {
      return "Finish drawing or editing roof geometry to continue.";
    }

    if (!layoutFinished) {
      return "Locking roof layout...";
    }

    if (!areaReady) {
      return "Calculating roof square footage before unlocking solar potential...";
    }

    return "Solar potential unlocked and synced with roof constraints.";
  }, [areaReady, hasPrimaryRoof, isDrawToolActive, layoutFinished]);

  useEffect(() => {
    if (!showMapTools || !hasPrimaryRoof || isDrawToolActive) {
      setLayoutFinished(false);
      return;
    }

    const finishHandle = window.setTimeout(() => {
      setLayoutFinished(true);
    }, 1000);

    return () => {
      window.clearTimeout(finishHandle);
    };
  }, [hasPrimaryRoof, isDrawToolActive, obstacleMarkers, roofElements, showMapTools]);

  useEffect(() => {
    if (!showMapTools || !layoutFinished || !hasPrimaryRoof || isDrawToolActive) {
      return;
    }

    const areaHandle = window.setTimeout(() => {
      const summary = calculateRoofAreaSummary(featureGroupRef.current);

      if (!summary) {
        setRoofAreaSummary(null);
        setRoofAreaMessage("Draw at least one roof polygon, rectangle, or circle before solar potential unlocks.");
        return;
      }

      setRoofAreaSummary(summary);

      if (summary.netSqFt <= 0) {
        setRoofAreaMessage("Usable roof area is zero after obstacle clearance. Adjust the layout to unlock solar potential.");
        return;
      }

      setRoofAreaMessage(`Area auto-calculated: ${Math.round(summary.netSqFt)} sq ft net usable.`);
    }, 120);

    return () => {
      window.clearTimeout(areaHandle);
    };
  }, [featureGroupRef, hasPrimaryRoof, isDrawToolActive, layoutFinished, obstacleMarkers, roofElements, showMapTools]);

  useEffect(() => {
    setDetectionPreview(null);
    setDetectionMessage(null);
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
    setLayoutFinished(false);
    setPlacedPanels([]);
    setPanelTargetCount(25);
    setPanelTargetManuallySet(false);
    setPanelLayoutMessage(null);
    setRoofMaxPanelCount(null);
    setPlannerCapacityError(null);
    setPlannerSyncState("estimate");
    setPlannerSyncMessage("Enter an average monthly bill, then draw a primary roof polygon to turn the estimate into a live packed layout.");
    clearDetectionPreview();
    clearDetectionError();
  }, [coordinates, clearDetectionError, clearDetectionPreview]);

  useEffect(() => {
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
  }, [roofElements, obstacleMarkers]);

  useEffect(() => {
    if (!solarUnlocked) {
      setPanelTargetManuallySet(false);
      return;
    }

    if (!panelTargetManuallySet) {
      setPanelTargetCount(Math.max(1, plannerFinancials.recommendedPanelCount));
    }
  }, [panelTargetManuallySet, plannerFinancials.recommendedPanelCount, solarUnlocked]);

  useEffect(() => {
    if (!solarUnlocked) {
      return;
    }

    const roofMax = plannerFinancials.roofMaxPanelCount;
    if (roofMax === null) {
      return;
    }

    if (roofMax <= 0) {
      setPanelTargetCount(0);
      return;
    }

    setPanelTargetCount((current) => Math.min(Math.max(current, 1), roofMax));
  }, [plannerFinancials.roofMaxPanelCount, solarUnlocked]);

  useEffect(() => {
    if (placedPanels.length === 0) {
      return;
    }

    setPlacedPanels([]);
    setPanelLayoutMessage("Roof or obstacle geometry changed. Panel layout cleared so you can repack it against the new exclusions.");
  }, [obstacleMarkers, roofElements]);

  const toggleWorkspace = () => {
    setShowMapTools((previous) => {
      const next = !previous;
      if (next) setViewMode("satellite");
      if (!next) {
        setDetectionPreview(null);
        clearDetectionPreview();
      }
      return next;
    });
  };

  const clearAllData = () => {
    featureGroupRef.current?.clearLayers();
    clearDetectionPreview();
    setDetectionPreview(null);
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
    setLayoutFinished(false);
    setRoofElements([]);
    setObstacleMarkers([]);
    setPlacedPanels([]);
    setPanelTargetCount(25);
    setPanelTargetManuallySet(false);
    setPanelLayoutMessage(null);
    setRoofMaxPanelCount(null);
    setPlannerCapacityError(null);
  };

  const exportGeoJson = () => {
    downloadRoofData(roofElements, obstacleMarkers);
  };

  const autoPackPanelLayout = useCallback(async () => {
    setPanelLayoutMode("auto");

    if (!solarUnlocked) {
      setPanelLayoutMessage(solarUnlockMessage);
      return;
    }

    if (!panelLayoutContext.primaryRoof) {
      setPanelLayoutMessage("Draw one primary roof polygon first, then add any inner lines or shapes as exclusion zones.");
      return;
    }

    if (panelLayoutContext.edgeBufferMeters > 0 && !panelLayoutContext.usableRoof) {
      setPlacedPanels([]);
      setPanelLayoutMessage("The current edge buffer removes all usable roof area. Reduce the setback before packing.");
      return;
    }

    try {
      const { payload, durationMs } = await runAutoPackTask({
        context: panelLayoutContext,
        panelTypeId,
        alignmentAngleDegrees: panelAlignmentAngleDegrees,
        maxPanels: panelTargetCount,
        solarHeatmap: solarAnalysis,
      });
      const { panels } = payload;

      setPlacedPanels(panels.map((feature) => createPlacedPanelRecord(feature, panelTypeId, "auto")));
      logDevPerf("manual-auto-pack", durationMs, `panels=${panels.length} target=${panelTargetCount}`);

      if (panels.length === 0) {
        setPanelLayoutMessage("No valid panel placements were found inside the roof after exclusions and edge checks.");
        return;
      }

      setPanelLayoutMessage(
        solarAnalysis
          ? `Auto-packed ${panels.length} panel(s), prioritizing greener solar zones and staying within your ${panelTargetCount}-panel target.`
          : `Auto-packed ${panels.length} panel(s) while avoiding ${panelLayoutContext.exclusionZones.length} exclusion zone(s) and staying within your ${panelTargetCount}-panel target.`
      );
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Manual auto-pack failed.", error);
      }

      setPlacedPanels([]);
      setPanelLayoutMessage("Auto-pack failed unexpectedly. Adjust geometry and try again.");
    }
  }, [panelAlignmentAngleDegrees, panelLayoutContext, panelTargetCount, panelTypeId, runAutoPackTask, solarAnalysis, solarUnlockMessage, solarUnlocked]);

  const clearAllPanels = useCallback(() => {
    setPlacedPanels([]);
    setPanelLayoutMessage("Panel layout cleared.");
  }, []);

  useEffect(() => {
    plannerSyncRunRef.current += 1;
    const runId = plannerSyncRunRef.current;

    if (!showMapTools) {
      return;
    }

    if (plannerCapacityError) {
      setPlannerSyncState("error");
      setPlannerSyncMessage("Planner capacity check failed. The numeric model is still available while layout sync pauses.");
      return;
    }

    if (!solarUnlocked) {
      setPlannerSyncState("estimate");
      setPlannerSyncMessage(solarUnlockMessage);
      return;
    }

    if (panelLayoutMode !== "auto") {
      setPlannerSyncState("paused");
      setPlannerSyncMessage("Planner sync is paused while manual layout mode is active.");
      return;
    }

    if (isDrawToolActive) {
      setPlannerSyncState("paused");
      setPlannerSyncMessage("Paused while drawing or editing roof geometry.");
      return;
    }

    setPlannerSyncState("syncing");
    setPlannerSyncMessage("Repacking panels from the current bill target and roof constraints...");

    const syncHandle = window.setTimeout(() => {
      runAutoPackTask({
        context: panelLayoutContext,
        panelTypeId,
        alignmentAngleDegrees: panelAlignmentAngleDegrees,
        maxPanels: plannerFinancials.activePanelCount,
        solarHeatmap: solarAnalysis,
      })
        .then(({ payload, durationMs }) => {
          if (plannerSyncRunRef.current !== runId) {
            return;
          }

          const { panels } = payload;
          setPlacedPanels(panels.map((feature) => createPlacedPanelRecord(feature, panelTypeId, "auto")));
          logDevPerf("planner-sync-pack", durationMs, `panels=${panels.length} target=${plannerFinancials.activePanelCount}`);

          if (panels.length === 0) {
            const emptyMessage = "Current geometry cannot fit the selected panel footprint. Draw more usable roof or switch the footprint.";
            setPlannerSyncState("synced");
            setPlannerSyncMessage(emptyMessage);
            setPanelLayoutMessage(emptyMessage);
            return;
          }

          const syncMessage = plannerFinancials.roofLimited
            ? `Roof maxes at ${plannerFinancials.roofMaxPanelCount} panel(s), leaving about ${Math.round(
                plannerFinancials.monthlyShortfallKwh
              )} kWh/month on-grid. Layout synced from solar potential analysis.`
            : `Packing ${panels.length} panel(s) for about ${Math.round(
                plannerFinancials.energyCoveredDisplayPercent
              )}% bill coverage. Layout synced from solar potential analysis.`;

          setPlannerSyncState("synced");
          setPlannerSyncMessage(syncMessage);
          setPanelLayoutMessage(syncMessage);
        })
        .catch((error) => {
          if (plannerSyncRunRef.current !== runId) {
            return;
          }

          if (import.meta.env.DEV) {
            console.error("Solar potential sync failed.", error);
          }

          setPlannerSyncState("error");
          setPlannerSyncMessage("Planner sync hit an unexpected issue. Numeric estimates remain available while map sync pauses.");
        });
    }, 250);

    return () => {
      window.clearTimeout(syncHandle);
    };
  }, [
    showMapTools,
    solarUnlocked,
    solarUnlockMessage,
    plannerCapacityError,
    panelLayoutContext,
    plannerFinancials.activePanelCount,
    plannerFinancials.roofLimited,
    plannerFinancials.roofMaxPanelCount,
    plannerFinancials.monthlyShortfallKwh,
    plannerFinancials.energyCoveredDisplayPercent,
    panelLayoutMode,
    isDrawToolActive,
    panelTypeId,
    panelAlignmentAngleDegrees,
    solarAnalysis,
    runAutoPackTask,
  ]);

  const runAutoDetection = useCallback(async () => {
    if (!coordinates || !mapRef.current || !mapContainerRef.current) {
      setDetectionMessage("Select a house location and open workspace before running auto detection.");
      return;
    }

    try {
      const activeMap = mapRef.current;
      setViewMode("satellite");
      setDetectionMessage(null);

      // Give the satellite layer a moment to become visible before snapshot capture.
      await delay(200);
      activeMap.invalidateSize();
      await delay(150);

      const snapshot = await captureMapSnapshot(mapContainerRef.current, activeMap);
      const bounds = activeMap.getBounds();

      const detection = await detectFromSnapshot({
        center: coordinates,
        bounds: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        snapshotBase64: snapshot.snapshotBase64,
        width: snapshot.width,
        height: snapshot.height,
        zoom: activeMap.getZoom(),
        roofConfidenceThreshold: detectionConfidenceThreshold,
        obstacleConfidenceThreshold: Math.max(0.2, detectionConfidenceThreshold - 0.05),
      });

      setDetectionPreview(detection);
      showDetectionPreview(detection);

      if (detection.roofPlanes.length === 0) {
        setDetectionMessage("No high-confidence roof edges found. Try zooming in and rerun detection.");
      } else if (detection.metadata.warnings.length > 0) {
        setDetectionMessage(detection.metadata.warnings[0]);
      }
    } catch (error) {
      clearDetectionPreview();
      setDetectionPreview(null);
      const fallbackMessage =
        "Auto detection failed. This can happen when tile snapshots are blocked by imagery CORS rules. Continue with manual mapping for this location.";
      setDetectionMessage(error instanceof Error ? error.message : fallbackMessage);
    }
  }, [
    coordinates,
    detectFromSnapshot,
    detectionConfidenceThreshold,
    mapContainerRef,
    mapRef,
    showDetectionPreview,
    clearDetectionPreview,
  ]);

  const acceptAutoDetection = useCallback(() => {
    if (!detectionPreview) return;
    acceptDetectionPreview(detectionPreview);
    setDetectionMessage(
      `Accepted ${detectionPreview.roofPlanes.length} roof plane(s) and ${detectionPreview.obstacles.length} obstacle(s).`
    );
    setDetectionPreview(null);
  }, [acceptDetectionPreview, detectionPreview]);

  const rejectAutoDetection = useCallback(() => {
    clearDetectionPreview();
    setDetectionPreview(null);
    setDetectionMessage("Detection preview cleared. You can rerun auto detection or continue manual mapping.");
  }, [clearDetectionPreview]);

  const calculateSqFt = useCallback(() => {
    const summary = calculateRoofAreaSummary(featureGroupRef.current);

    if (!summary) {
      setRoofAreaSummary(null);
      setRoofAreaMessage("Draw at least one roof polygon, rectangle, or circle before calculating solar surface area.");
      return;
    }

    setRoofAreaSummary(summary);
    setRoofAreaMessage(
      summary.ignoredRoofShapes > 0
        ? `Area updated. Ignored ${summary.ignoredRoofShapes} unsupported roof outline(s).`
        : `Area updated across ${summary.roofShapeCount} roof outline(s).`
    );
  }, [featureGroupRef]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#050505] font-sans text-zinc-100 selection:bg-white/20 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05)_0%,transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0 mix-blend-overlay" />

      <MainHeader
        address={address}
        isSearching={isSearching}
        searchResults={searchResults}
        recentSearches={recentSearches}
        coordinates={coordinates}
        showMapTools={showMapTools}
        viewMode={viewMode}
        solarOverlayEnabled={solarOverlayEnabled}
        onAddressChange={setAddress}
        onSearchSubmit={handleSearchSubmit}
        onSelectAddress={selectAddress}
        onToggleWorkspace={toggleWorkspace}
        onSetViewMode={setViewMode}
        onToggleSolarOverlay={() => setSolarOverlayEnabled((previous) => !previous)}
      />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-5 lg:px-8 lg:pb-8 lg:pt-6 xl:px-10">
        <WorkspaceContent
          coordinates={coordinates}
          viewMode={viewMode}
          showMapTools={showMapTools}
          roofElements={roofElements}
          obstacleMarkers={obstacleMarkers}
          mapContainerRef={mapContainerRef}
          onClearAll={clearAllData}
          onExport={exportGeoJson}
          onAutoDetect={runAutoDetection}
          onCalculateSqFt={calculateSqFt}
          onAcceptDetection={acceptAutoDetection}
          onRejectDetection={rejectAutoDetection}
          isAutoDetecting={isDetecting}
          detectionPreview={detectionPreview}
          detectionMessage={detectionMessage ?? detectionError}
          roofAreaSummary={roofAreaSummary}
          roofAreaMessage={roofAreaMessage}
          detectionConfidenceThreshold={detectionConfidenceThreshold}
          onDetectionConfidenceThresholdChange={setDetectionConfidenceThreshold}
          solarOverlayEnabled={solarOverlayEnabled}
          solarHeatmap={solarHeatmap}
          panelTypeId={panelTypeId}
          onPanelTypeChange={handlePanelTypeChange}
          panelLayoutMode={panelLayoutMode}
          onPanelLayoutModeChange={setPanelLayoutMode}
          panelTargetCount={panelTargetCount}
          onPanelTargetCountChange={handlePanelTargetCountChange}
          onAutoPackPanels={autoPackPanelLayout}
          onClearPanels={clearAllPanels}
          placedPanelCount={placedPanels.length}
          estimatedPanelKw={estimatedPanelKw}
          panelLayoutMessage={panelLayoutMessage}
          exclusionZoneCount={panelLayoutContext.exclusionZones.length}
          hasPrimaryRoof={hasPrimaryRoof}
          solarUnlocked={solarUnlocked}
          solarUnlockMessage={solarUnlockMessage}
          plannerInputs={plannerInputs}
          plannerFinancials={plannerFinancials}
          plannerSyncState={plannerSyncState}
          plannerSyncMessage={plannerSyncMessage}
          onPlannerInputChange={handlePlannerInputChange}
          onResetPlannerInputs={resetPlannerInputs}
        />
      </main>
    </div>
  );
}
