import html2canvas from "html2canvas";

export type SnapshotResult = {
  snapshotBase64: string;
  width: number;
  height: number;
};

export async function captureMapSnapshot(container: HTMLDivElement): Promise<SnapshotResult> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(container, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#000000",
      logging: false,
      scale: 1,
    });
  } catch {
    throw new Error("Unable to capture map snapshot from current view.");
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
