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
      ".vinxi",
      "routeTree.gen.ts",
      "coverage",
      "test",
      "test/**/*",
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
    files: ["**/server/**/*.{ts,tsx}", "src/server.ts", "src/routes/api/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  eslintPluginPrettier,
);
