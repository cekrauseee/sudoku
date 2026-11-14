import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Test files share one database and bucket, which each test resets.
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
