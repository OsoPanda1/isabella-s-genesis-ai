import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import firebaseRulesPlugin from "@firebase/eslint-plugin-security-rules";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vercel",
      ".vinxi",
      "**/routeTree.gen.ts",
      "src/generated/prisma/**/*",
      "prisma.config.ts",
      "coverage",
      "test",
      "test/**/*",
      "test.ts",
      "src/tests/**/*",
      "latam-aegis-x",
      "latam-aegis-x/**/*",
      "quantum_utility_platform",
      "quantum_utility_platform/**/*",
    ],
  },
  firebaseRulesPlugin.configs["flat/recommended"],
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      security,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-eval": "error",
      "no-warning-comments": ["warn", { terms: ["todo", "fixme", "hack"] }],
      "no-restricted-globals": [
        "error",
        {
          name: "Math.random",
          message:
            "Do not use Math.random for security-sensitive randomness; use crypto.getRandomValues.",
        },
      ],
    },
  },
  {
    files: [
      "src/lib/accounting/accounting-repository.ts",
      "src/lib/accounting/double-entry-service.ts",
      "src/lib/bookpi.ts",
      "src/lib/cognitive/native-engine.ts",
      "src/lib/genesis/**/*.ts",
      "src/lib/intelligence/durable-model-registry.ts",
      "src/lib/isabella/middleware/trace.ts",
      "src/lib/isabella/ml/reinforcement.ts",
      "src/lib/isabella/models/registry.ts",
      "src/lib/monetization/revenue.ts",
      "src/lib/persistence/repository-factory.ts",
      "src/lib/repositories/bookpi-postgres-repository.ts",
      "src/lib/skills/run-skill.ts",
      "src/lib/sovereign-state-repository.ts",
      "src/server-routes/api/db.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": "warn",
    },
  },
  {
    files: ["test-endpoints.mjs", "test.ts"],
    rules: {
      "prettier/prettier": "off",
    },
  },
  {
    files: ["**/server/**/*.{ts,tsx}", "src/server.ts", "src/routes/api/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: [
      "src/components/ui/*.tsx",
      "src/components/isabella/LatamAegisDashboard.tsx",
      "src/components/quantum/QuantumBridgeMonitor.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  eslintPluginPrettier,
);
