import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Files to ignore (build output, generated files)
  { ignores: ["dist", "coverage"] },

  // TypeScript + React rules for source files
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // React Hooks rules (detect stale closures, missing deps, etc.)
      ...reactHooks.configs.recommended.rules,

      // Vite Fast Refresh — warn when a module exports things other than
      // React components, which would break HMR.
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // TypeScript: allow explicit `any` with a comment — the codebase uses it
      // in a few edge cases (Paystack webhook handler, ECharts types). We warn,
      // not error, to keep CI unblocked while the team cleans them up.
      "@typescript-eslint/no-explicit-any": "warn",

      // TypeScript: unused variables are an error (catches dead imports early).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
