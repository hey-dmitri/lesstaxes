import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Enforce the architectural boundary described in PROJECT.md 16.1 and
    // engine/README.md: the calculation engine stays framework-free so it can
    // outlive any UI decision and be tested without rendering anything.
    files: ["engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-dom",
                "react/*",
                "react-dom/*",
                "@/app/*",
                "**/app/*",
                "server-only",
                "client-only",
              ],
              message:
                "engine/ must stay framework-free. Move UI-facing code to lib/ or app/ instead. See engine/README.md.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
