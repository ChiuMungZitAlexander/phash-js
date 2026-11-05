import { defineConfig } from "vitest/config";
import inlineWasm from "./scripts/inline-wasm.mjs";

export default defineConfig({
  plugins: [inlineWasm()],
  test: {
    environment: "node",
    include: ["packages/{core,client,server}/src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/{core,client,server}/src/**/*.ts"],
      exclude: ["**/*.spec.ts", "**/*.d.ts"],
    },
  },
});
