import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
      plugins: [react()],
        server: {
                port: 5173,
                    proxy: {
                              // In dev, forward /api calls to Express on 3001
                                    "/api": {
                                                target: "http://localhost:3001",
                                                        changeOrigin: true,
                                    },
                    },
        },
          build: {
                outDir: "dist",
                    emptyOutDir: true,
          },
});

          }
                                    }
                    }
        }
})