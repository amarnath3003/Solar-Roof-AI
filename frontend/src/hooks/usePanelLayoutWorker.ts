import { useCallback, useEffect, useRef } from "react";
import type { AutoPackCapacityResult, AutoPackPanelsResult } from "@/lib/panelLayout";
import type { SolarHeatmap } from "@/lib/solarHeatmap";
import type { PanelLayoutContext, PanelTypeId } from "@/types";

type AutoPackTaskPayload = {
  context: PanelLayoutContext;
  panelTypeId: PanelTypeId;
  alignmentAngleDegrees: number;
  maxPanels: number;
  solarHeatmap: SolarHeatmap | null;
};

type CapacityTaskPayload = {
  context: PanelLayoutContext;
  panelTypeId: PanelTypeId;
  alignmentAngleDegrees: number;
};

type WorkerRequest =
  | {
      requestId: number;
      task: "auto-pack";
      payload: AutoPackTaskPayload;
    }
  | {
      requestId: number;
      task: "capacity";
      payload: CapacityTaskPayload;
    };

type WorkerSuccessResponse<TPayload> = {
  requestId: number;
  ok: true;
  durationMs: number;
  payload: TPayload;
};

type WorkerErrorResponse = {
  requestId: number;
  ok: false;
  error: string;
};

type WorkerResponse = WorkerSuccessResponse<unknown> | WorkerErrorResponse;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
};

export type WorkerTimedResult<TPayload> = {
  payload: TPayload;
  durationMs: number;
};

export function usePanelLayoutWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequestsRef = useRef(new Map<number, PendingRequest>());
  const nextRequestIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/panelLayout.worker.ts", import.meta.url), { type: "module" });

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pendingRequest = pendingRequestsRef.current.get(response.requestId);

      if (!pendingRequest) {
        return;
      }

      pendingRequestsRef.current.delete(response.requestId);

      if (response.ok) {
        pendingRequest.resolve({
          payload: response.payload,
          durationMs: response.durationMs,
        });
        return;
      }

      pendingRequest.reject(new Error(response.error));
    };

    const handleError = (event: ErrorEvent) => {
      const message = event.message || "Panel layout worker crashed.";
      pendingRequestsRef.current.forEach((pendingRequest) => {
        pendingRequest.reject(new Error(message));
      });
      pendingRequestsRef.current.clear();
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    workerRef.current = worker;

    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      worker.terminate();
      workerRef.current = null;

      pendingRequestsRef.current.forEach((pendingRequest) => {
        pendingRequest.reject(new Error("Panel layout worker terminated."));
      });
      pendingRequestsRef.current.clear();
    };
  }, []);

  const postRequest = useCallback(
    <TPayload,>(task: WorkerRequest["task"], payload: AutoPackTaskPayload | CapacityTaskPayload) => {
      return new Promise<WorkerTimedResult<TPayload>>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("Panel layout worker is unavailable."));
          return;
        }

        const requestId = nextRequestIdRef.current + 1;
        nextRequestIdRef.current = requestId;
        pendingRequestsRef.current.set(requestId, { resolve, reject });

        worker.postMessage({
          requestId,
          task,
          payload,
        } satisfies WorkerRequest);
      });
    },
    []
  );

  const runAutoPackTask = useCallback(
    (payload: AutoPackTaskPayload) => postRequest<AutoPackPanelsResult>("auto-pack", payload),
    [postRequest]
  );

  const runCapacityTask = useCallback(
    (payload: CapacityTaskPayload) => postRequest<AutoPackCapacityResult>("capacity", payload),
    [postRequest]
  );

  return {
    runAutoPackTask,
    runCapacityTask,
  };
}
