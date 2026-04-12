/// <reference lib="webworker" />

import { autoPackPanels, autoPackPanelsToCapacity } from "../lib/panelLayout";
import type { SolarHeatmap } from "../lib/solarHeatmap";
import type { PanelLayoutContext, PanelTypeId } from "../types";

type AutoPackPayload = {
  context: PanelLayoutContext;
  panelTypeId: PanelTypeId;
  alignmentAngleDegrees: number;
  maxPanels: number;
  solarHeatmap: SolarHeatmap | null;
};

type CapacityPayload = {
  context: PanelLayoutContext;
  panelTypeId: PanelTypeId;
  alignmentAngleDegrees: number;
};

type WorkerRequest =
  | {
      requestId: number;
      task: "auto-pack";
      payload: AutoPackPayload;
    }
  | {
      requestId: number;
      task: "capacity";
      payload: CapacityPayload;
    };

type WorkerSuccessResponse = {
  requestId: number;
  ok: true;
  durationMs: number;
  payload: unknown;
};

type WorkerErrorResponse = {
  requestId: number;
  ok: false;
  error: string;
};

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { requestId, task, payload } = event.data;

  try {
    const start = performance.now();

    if (task === "auto-pack") {
      const result = autoPackPanels(payload.context, payload.panelTypeId, payload.alignmentAngleDegrees, {
        maxPanels: payload.maxPanels,
        solarHeatmap: payload.solarHeatmap,
      });

      const response: WorkerSuccessResponse = {
        requestId,
        ok: true,
        durationMs: performance.now() - start,
        payload: result,
      };

      scope.postMessage(response satisfies WorkerResponse);
      return;
    }

    const capacity = autoPackPanelsToCapacity(payload.context, payload.panelTypeId, payload.alignmentAngleDegrees);

    const response: WorkerSuccessResponse = {
      requestId,
      ok: true,
      durationMs: performance.now() - start,
      payload: capacity,
    };

    scope.postMessage(response satisfies WorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Panel layout worker failed.";
    const response: WorkerErrorResponse = {
      requestId,
      ok: false,
      error: message,
    };

    scope.postMessage(response satisfies WorkerResponse);
  }
};

export {};
