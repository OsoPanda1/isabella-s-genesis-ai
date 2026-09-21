// @lovable.dev/vite-tanstack-config ya incluye tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const browserCryptoShim = fileURLToPath(
  new URL("./src/lib/shims/node-crypto-browser.ts", import.meta.url),
);

/**
 * El grafo del cliente alcanza módulos soberanos que importan `node:crypto`.
 * En el navegador ese módulo está externalizado y cualquier acceso a sus
 * exportaciones lanza y deja la pantalla en blanco: se resuelve hacia un shim
 * WebCrypto. El entorno SSR conserva `node:crypto` real.
 */
const nodeCryptoBrowserShim = {
  name: "isabella:node-crypto-browser-shim",
  enforce: "pre" as const,
  resolveId(this: { environment?: { name?: string } }, id: string) {
    if (this.environment?.name !== "client") return null;
    return id === "crypto" || id === "node:crypto" ? browserCryptoShim : null;
  },
};

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [nodeCryptoBrowserShim],
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
