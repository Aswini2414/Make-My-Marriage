import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Forward slashes so the alias also resolves on Windows.
const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url)).replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fromRoot("./") },
      // server-only throws outside Next's server bundle; tests run server code directly.
      { find: /^server-only$/, replacement: fromRoot("./tests/server-only-stub.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // One shared database, so test files run one at a time.
    fileParallelism: false,
  },
});
