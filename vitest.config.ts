import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  test: {
    testTimeout: 15000,
    // Without this, vitest's file glob also picks up the stale test/helper
    // copies living inside nested git worktrees under .claude/worktrees/
    // (not excluded by vitest's defaults, only by .git/info/exclude, which
    // vitest doesn't consult) — those can predate schema migrations and fail
    // with unrelated PostgREST errors that have nothing to do with this repo.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
