import { config } from "@repo/eslint-config/base";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(globalIgnores(["drizzle/"]), config, {
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
