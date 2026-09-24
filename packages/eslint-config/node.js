import { config as baseConfig } from "./base.js";
import pluginNode from "eslint-plugin-n";
import globals from "globals";

/**
 * A custom ESLint configuration for Node.js libraries.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const nodeConfig = [
  ...baseConfig,
  {
    ignores: ["build/**", "*.config.*", ".turbo/**", "node_modules/**"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    plugins: {
      n: pluginNode,
    },
    rules: {
      ...pluginNode.configs["flat/recommended"].rules,
      "n/no-process-exit": "off",
      "n/no-sync": "off",
      "n/no-missing-import": "off",
    },
  },
  {
    files: ["**/*.ts"],
  },
];