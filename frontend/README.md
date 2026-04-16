# Solar-Roof-AI

React + Vite frontend for roof tracing and GeoJSON export.

## Scripts

- `npm run dev` or `npm start`: Start Vite dev server
- `npm run build`: Build production assets
- `npm run preview`: Preview production build locally

## Auto Detection

Auto detection runs directly from the frontend using the Roboflow hosted workflow.

In local development, requests are proxied through Vite (`/roboflow-proxy`) to avoid browser CORS/preflight failures.

Configure with environment variables:

- `VITE_ROBOFLOW_API_URL=https://serverless.roboflow.com`
- `VITE_ROBOFLOW_WORKSPACE=rooflayout`
- `VITE_ROBOFLOW_WORKFLOW_ID=detect-count-and-visualize`
- `VITE_ROBOFLOW_WORKFLOW_URL=https://detect.roboflow.com/workflow/detect-count-and-visualize` (optional, overrides API_URL/WORKSPACE/WORKFLOW_ID)
- `VITE_ROBOFLOW_API_KEY=...` (required)

If you change `.env`, restart the Vite dev server so updated variables and proxy settings are applied.

Security note: any `VITE_*` variable is bundled into client-side code and visible in browser devtools. For production deployments, prefer a server-side proxy/function for API keys.
