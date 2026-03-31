import html2canvas from "html2canvas";

export type SnapshotResult = {
  snapshotBase64: string;
  width: number;
  height: number;
};

const TILE_LOAD_TIMEOUT_MS = 4000;
const CAPTURE_RETRY_DELAY_MS = 300;

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

function normalizeCaptureError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    rawMessage.includes("tainted")
    || rawMessage.includes("cross-origin")
    || rawMessage.includes("security")
    || rawMessage.includes("cors")
  ) {
    return new Error("Snapshot capture blocked by map tile CORS restrictions for this location.");
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

export async function captureMapSnapshot(container: HTMLDivElement): Promise<SnapshotResult> {
  const rect = container.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) {
    throw new Error("Unable to capture map snapshot from current view. Ensure satellite map is visible.");
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = await renderSnapshotCanvas(container);
  } catch (firstError) {
    try {
      await delay(CAPTURE_RETRY_DELAY_MS);
      canvas = await renderSnapshotCanvas(container);
    } catch (secondError) {
      throw normalizeCaptureError(secondError ?? firstError);
    }
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
