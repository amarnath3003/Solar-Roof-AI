import { useRef, useState } from "react";

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DetectionSnipModalProps = {
  isOpen: boolean;
  imageDataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function DetectionSnipModal({
  isOpen,
  imageDataUrl,
  sourceWidth,
  sourceHeight,
  onCancel,
  onConfirm,
}: DetectionSnipModalProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionDisplay, setSelectionDisplay] = useState<CropRect | null>(null);

  const selectionSource = (() => {
    if (!selectionDisplay || !imageRef.current) {
      return null;
    }

    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = sourceWidth / Math.max(rect.width, 1);
    const scaleY = sourceHeight / Math.max(rect.height, 1);

    const x = Math.round(selectionDisplay.x * scaleX);
    const y = Math.round(selectionDisplay.y * scaleY);
    const width = Math.round(selectionDisplay.width * scaleX);
    const height = Math.round(selectionDisplay.height * scaleY);

    if (width < 16 || height < 16) {
      return null;
    }

    return {
      x: clamp(x, 0, sourceWidth - 1),
      y: clamp(y, 0, sourceHeight - 1),
      width: clamp(width, 1, sourceWidth),
      height: clamp(height, 1, sourceHeight),
    };
  })();

  if (!isOpen) {
    return null;
  }

  const hasSelection = selectionDisplay !== null && selectionDisplay.width >= 16 && selectionDisplay.height >= 16;

  const getRelativePoint = (clientX: number, clientY: number) => {
    const image = imageRef.current;
    if (!image) {
      return null;
    }

    const rect = image.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    return { x, y };
  };

  const updateSelection = (current: { x: number; y: number }) => {
    if (!dragStart) {
      return;
    }

    const x = Math.min(dragStart.x, current.x);
    const y = Math.min(dragStart.y, current.y);
    const width = Math.abs(current.x - dragStart.x);
    const height = Math.abs(current.y - dragStart.y);
    setSelectionDisplay({ x, y, width, height });
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">Snip For Detection</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Drag a box around the house boundary, then run detection on the cropped image.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white/10"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div
              className="relative mx-auto w-fit max-w-full cursor-crosshair select-none"
              onMouseDown={(event) => {
                const start = getRelativePoint(event.clientX, event.clientY);
                if (!start) return;
                setDragStart(start);
                setSelectionDisplay({ x: start.x, y: start.y, width: 0, height: 0 });
              }}
              onMouseMove={(event) => {
                if (!dragStart) return;
                const point = getRelativePoint(event.clientX, event.clientY);
                if (!point) return;
                updateSelection(point);
              }}
              onMouseUp={() => setDragStart(null)}
              onMouseLeave={() => setDragStart(null)}
            >
              <img
                ref={imageRef}
                src={imageDataUrl}
                alt="Detection snapshot"
                className="max-h-[64vh] max-w-full rounded-lg border border-white/10"
                draggable={false}
              />

              {selectionDisplay && (
                <div
                  className="pointer-events-none absolute border-2 border-lime-300 bg-lime-400/20"
                  style={{
                    left: selectionDisplay.x,
                    top: selectionDisplay.y,
                    width: selectionDisplay.width,
                    height: selectionDisplay.height,
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Source: {sourceWidth}x{sourceHeight}
              {selectionSource
                ? ` | Crop: x=${selectionSource.x}, y=${selectionSource.y}, w=${selectionSource.width}, h=${selectionSource.height}`
                : " | Draw a crop box around the target house"}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!selectionSource) return;
                onConfirm(selectionSource);
              }}
              disabled={!hasSelection || !selectionSource}
              className="rounded-lg border border-lime-300/40 bg-lime-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-lime-200 transition hover:bg-lime-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Detect Snip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CropRect };
