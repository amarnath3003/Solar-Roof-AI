import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["leaflet", "leaflet-draw", "@turf/turf", "fast-deep-equal"],
    needsInterop: ["fast-deep-equal"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/gmaps-tiles": {
        target: "https://mt0.google.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gmaps-tiles/, ""),
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            proxyRes.headers["Access-Control-Allow-Origin"] = "*";
          });
        },
      },
    },
  },
});
