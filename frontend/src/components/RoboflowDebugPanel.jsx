import { useMemo, useState } from "react";

const ROBOFLOW_API_URL = import.meta.env.VITE_ROBOFLOW_API_URL;
const ROBOFLOW_WORKSPACE = import.meta.env.VITE_ROBOFLOW_WORKSPACE;
const ROBOFLOW_WORKFLOW_ID = import.meta.env.VITE_ROBOFLOW_WORKFLOW_ID;
const ROBOFLOW_WORKFLOW_URL = import.meta.env.VITE_ROBOFLOW_WORKFLOW_URL;
const ROBOFLOW_API_KEY = import.meta.env.VITE_ROBOFLOW_API_KEY;
const ROBOFLOW_DEV_PROXY_PREFIX = "/roboflow-proxy";

function stripDataUrlPrefix(value) {
  if (!value.includes(",")) return value;
  return value.split(",", 2)[1] ?? value;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function toDevProxyUrl(absoluteUrl) {
  return `${ROBOFLOW_DEV_PROXY_PREFIX}/${absoluteUrl.replace(/^https?:\/\//, "")}`;
}

function withApiKeyQuery(endpoint, apiKey) {
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

function endpointCandidates() {
  const candidates = [];

  if (ROBOFLOW_WORKFLOW_URL) {
    candidates.push(import.meta.env.DEV ? toDevProxyUrl(ROBOFLOW_WORKFLOW_URL) : ROBOFLOW_WORKFLOW_URL);

    if (/\/workflow\//.test(ROBOFLOW_WORKFLOW_URL)) {
      const alternate = ROBOFLOW_WORKFLOW_URL.replace(/\/workflow\//, "/workflows/");
      candidates.push(import.meta.env.DEV ? toDevProxyUrl(alternate) : alternate);
    }
  }

  if (ROBOFLOW_API_URL && ROBOFLOW_WORKSPACE && ROBOFLOW_WORKFLOW_ID) {
    const serverless = `${ROBOFLOW_API_URL.replace(/\/$/, "")}/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW_ID}`;
    candidates.push(import.meta.env.DEV ? toDevProxyUrl(serverless) : serverless);
  }

  return [...new Set(candidates)];
}

function renderPretty(value) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function RoboflowDebugPanel({ isOpen, onClose }) {
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const endpoints = useMemo(() => endpointCandidates(), []);

  if (!isOpen) {
    return null;
  }

  const handleImageSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDataUrl(dataUrl);
      setSelectedFileName(file.name);
      setError("");
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Failed to read selected image.");
    }
  };

  const handleRun = async () => {
    if (!ROBOFLOW_API_KEY) {
      setError("Missing VITE_ROBOFLOW_API_KEY in .env.");
      return;
    }

    if (!imageDataUrl) {
      setError("Select an image before running the test.");
      return;
    }

    if (endpoints.length === 0) {
      setError("No endpoint candidates generated from env config.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResults([]);

    const payload = {
      api_key: ROBOFLOW_API_KEY,
      inputs: {
        image: {
          type: "base64",
          value: stripDataUrlPrefix(imageDataUrl),
        },
      },
    };

    const nextResults = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(withApiKeyQuery(endpoint, ROBOFLOW_API_KEY), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ROBOFLOW_API_KEY,
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        let parsed = rawText;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          // Keep raw text when body is not JSON.
        }

        nextResults.push({
          endpoint,
          status: response.status,
          ok: response.ok,
          body: parsed,
        });
      } catch (requestError) {
        nextResults.push({
          endpoint,
          status: 0,
          ok: false,
          body: requestError instanceof Error ? requestError.message : "Unknown request error.",
        });
      }
    }

    setResults(nextResults);
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">Roboflow Debug</h2>
            <p className="mt-1 text-xs text-zinc-400">Upload an image and inspect raw output across endpoint variants.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-3">
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Image Upload</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="mt-2 block w-full cursor-pointer text-sm text-zinc-200 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-white/20 file:bg-zinc-800 file:px-3 file:py-1 file:text-xs file:uppercase file:tracking-[0.1em] file:text-zinc-200 hover:file:bg-zinc-700"
              />
              <p className="mt-2 text-xs text-zinc-400">{selectedFileName || "No image selected"}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">Endpoint Candidates</p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                {endpoints.map((endpoint) => (
                  <li key={endpoint} className="break-all rounded bg-zinc-800/60 px-2 py-1">
                    {endpoint}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={isLoading}
              className="rounded-lg border border-lime-300/40 bg-lime-400/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-lime-200 transition hover:bg-lime-400/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Running..." : "Run API Test"}
            </button>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>

          <div className="space-y-3">
            {results.length === 0 ? (
              <p className="text-sm text-zinc-500">No responses yet. Run the test to inspect raw output.</p>
            ) : null}

            {results.map((result, index) => (
              <div key={`${result.endpoint}-${index}`} className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-300">
                    Endpoint #{index + 1}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      result.ok ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
                    }`}
                  >
                    {result.status === 0 ? "Request Error" : `HTTP ${result.status}`}
                  </span>
                </div>
                <p className="mb-2 break-all text-xs text-zinc-400">{result.endpoint}</p>
                <pre className="max-h-72 overflow-auto rounded-lg bg-black/50 p-3 text-xs text-zinc-200">
                  {renderPretty(result.body)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
