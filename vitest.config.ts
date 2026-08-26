import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  test: {
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
