// @lovable.dev/vite-tanstack-config ya incluye tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "server-only": "vite/client",
      },
    },
    build: {
      target: "esnext",
      // Separación de chunks para aislamiento de rendimiento
      rollupOptions: {
        output: {
          manualChunks(id: string): string | undefined {
            if (id.includes("node_modules/three")) return "vendor-three";
            if (id.includes("node_modules/lucide-react")) return "vendor-icons";
            return undefined;
          },
        },
      },
    },
  },
});
