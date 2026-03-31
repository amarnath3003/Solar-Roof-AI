import html2canvas from "html2canvas";
import type { Map as LeafletMap } from "leaflet";

export type SnapshotResult = {
  snapshotBase64: string;
  width: number;
  height: number;
};

const TILE_LOAD_TIMEOUT_MS = 4000;
const CAPTURE_RETRY_DELAY_MS = 300;
const MIN_TILE_COUNT = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForTiles(container: HTMLDivElement): Promise<void> {
  const tileImages = Array.from(container.querySelectorAll("img.leaflet-tile")) as HTMLImageElement[];

  if (tileImages.length === 0) {
    return;
  }

  await Promise.all(
    tileImages.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const done = () => {
            window.clearTimeout(timeoutId);
            image.removeEventListener("load", done);
            image.removeEventListener("error", done);
            resolve();
          };

          const timeoutId = window.setTimeout(done, TILE_LOAD_TIMEOUT_MS);
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        })
    )
  );
}

function isCorsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("tainted")
    || message.includes("cross-origin")
    || message.includes("security")
    || message.includes("cors")
    || message.includes("origin-clean")
  );
}

function normalizePosition(value: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-max, Math.min(max * 2, value));
}

function renderTileCanvas(container: HTMLDivElement): { canvas: HTMLCanvasElement; drawnTiles: number } {
  const containerRect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(containerRect.width));
  const height = Math.max(1, Math.round(containerRect.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize snapshot canvas.");
  }

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  const tiles = Array.from(container.querySelectorAll("img.leaflet-tile")) as HTMLImageElement[];

  let drawnTiles = 0;
  tiles.forEach((tile) => {
    if (!tile.complete || tile.naturalWidth <= 0 || tile.naturalHeight <= 0) {
      return;
    }

    const tileRect = tile.getBoundingClientRect();
    const tileWidth = Math.max(1, Math.round(tileRect.width));
    const tileHeight = Math.max(1, Math.round(tileRect.height));
    const x = normalizePosition(tileRect.left - containerRect.left, width);
    const y = normalizePosition(tileRect.top - containerRect.top, height);

    if (x + tileWidth <= 0 || y + tileHeight <= 0 || x >= width || y >= height) {
      return;
    }

    context.drawImage(tile, x, y, tileWidth, tileHeight);
    drawnTiles += 1;
  });

  if (drawnTiles < MIN_TILE_COUNT) {
    throw new Error("Map tiles are not ready for capture.");
  }

  return { canvas, drawnTiles };
}

function normalizeCaptureError(error: unknown): Error {
  if (isCorsError(error)) {
    return new Error("Snapshot capture blocked by map tile CORS restrictions for this location.");
  }

  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";
  if (rawMessage.includes("map tiles are not ready")) {
    return new Error("Map imagery is still loading at this zoom level. Try zooming out by one step and run detection again.");
  }

  return new Error("Unable to capture map snapshot from current view. Wait for map tiles to load and try again.");
}

async function renderSnapshotCanvas(container: HTMLDivElement): Promise<HTMLCanvasElement> {
  await nextFrame();
  await nextFrame();
  await waitForTiles(container);

  return html2canvas(container, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#000000",
    logging: false,
    scale: 1,
    imageTimeout: TILE_LOAD_TIMEOUT_MS,
  });
}

async function captureFromTiles(container: HTMLDivElement, map?: LeafletMap): Promise<SnapshotResult> {
  if (map) {
    map.invalidateSize();
  }

  await nextFrame();
  await nextFrame();
  await waitForTiles(container);

  const { canvas } = renderTileCanvas(container);
  const snapshotBase64 = canvas.toDataURL("image/png").split(",", 2)[1] ?? "";

  return {
    snapshotBase64,
    width: canvas.width,
    height: canvas.height,
  };
}

export async function captureMapSnapshot(container: HTMLDivElement, map?: LeafletMap): Promise<SnapshotResult> {
  const rect = container.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) {
    throw new Error("Unable to capture map snapshot from current view. Ensure satellite map is visible.");
  }

  try {
    return await captureFromTiles(container, map);
  } catch (tileErrorFirst) {
    if (isCorsError(tileErrorFirst)) {
      throw normalizeCaptureError(tileErrorFirst);
    }

    try {
      await delay(CAPTURE_RETRY_DELAY_MS);
      return await captureFromTiles(container, map);
    } catch (tileErrorSecond) {
      if (isCorsError(tileErrorSecond)) {
        throw normalizeCaptureError(tileErrorSecond);
      }

      let canvas: HTMLCanvasElement;
      try {
        canvas = await renderSnapshotCanvas(container);
      } catch (html2CanvasError) {
        throw normalizeCaptureError(html2CanvasError ?? tileErrorSecond ?? tileErrorFirst);
      }

      let dataUrl = "";
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch {
        throw new Error("Snapshot capture blocked by map tile CORS restrictions for this location.");
      }

      const snapshotBase64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : dataUrl;

      return {
        snapshotBase64,
        width: canvas.width,
        height: canvas.height,
      };
    }
  }
}
