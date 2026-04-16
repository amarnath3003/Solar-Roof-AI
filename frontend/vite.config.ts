import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/roboflow-proxy": {
        target: "https://serverless.roboflow.com",
        changeOrigin: true,
        rewrite: (pathValue) => pathValue.replace(/^\/roboflow-proxy/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
