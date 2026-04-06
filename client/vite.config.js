import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__:                                    JSON.stringify(new Date().toISOString()),
    "import.meta.env.VITE_SUPABASE_URL":             JSON.stringify(process.env.SUPABASE_URL || ""),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(process.env.SUPABASE_PUBLISHABLE_KEY || ""),
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: ["@mediapipe/tasks-vision"],
      output: {
        globals: {
          "@mediapipe/tasks-vision": "mpTasksVision",
        },
      },
    },
  },
});
