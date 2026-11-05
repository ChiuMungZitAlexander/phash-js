import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: resolve(root, "packages/core"),
          environment: "node",
          include: ["src/**/*.spec.ts"],
        },
      },
      {
        resolve: { alias: { "@phash-js/core": resolve(root, "packages/core/src/index.ts") } },
        test: {
          name: "server",
          root: resolve(root, "packages/server"),
          environment: "node",
          include: ["src/**/*.spec.ts"],
        },
      },
    ],
  },
});
