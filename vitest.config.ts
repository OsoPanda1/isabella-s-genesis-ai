import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    projects: [
      {
        plugins: [tsConfigPaths()],
        test: {
          name: "unit",
          environment: "node",
          include: [
            "test/unit/**/*.test.ts",
            "test/unit/**/*.test.tsx",
            "test/*.test.ts",
            "test/native-ml/**/*.test.ts",
          ],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        plugins: [tsConfigPaths()],
        test: {
          name: "security",
          environment: "node",
          include: ["test/security/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        plugins: [tsConfigPaths()],
        test: {
          name: "bookpi",
          environment: "node",
          include: ["test/bookpi/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        plugins: [tsConfigPaths()],
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
