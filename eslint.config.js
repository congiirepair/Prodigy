import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      ".firebase/**",
      ".github/**",
      ".qa-streamer/**",
      ".tmp/**",
      "node_modules/**",
      "qa-artifacts/**",
      "functions/lib/**",
      "index.backup.*.html",
      "index.revert-safety.*.html",
      "client-config.backup.*.js",
      "client-config.revert-safety.*.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    },
  },
];
