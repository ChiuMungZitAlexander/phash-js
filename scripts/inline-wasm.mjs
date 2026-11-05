import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const prefix = "\0phash-inline-wasm:";

export default function inlineWasm() {
  return {
    name: "inline-codec-wasm",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/@jsquash/webp/codec/dec/webp_dec.js")) return null;
      // The upstream Emscripten wrapper assigns to import.meta.url. Replace
      // that mutable URL slot before Rollup emits CommonJS or bundlers parse it.
      // The decoder receives embedded wasmBinary and locateFile explicitly.
      return {
        code: `let __phashWebpModuleUrl;\n${code.replaceAll("import.meta.url", "__phashWebpModuleUrl")}`,
        map: null,
      };
    },
    resolveId(source, importer) {
      if (!source.endsWith(".wasm?base64")) return null;
      return `${prefix}${require.resolve(source.slice(0, -7), {
        paths: [importer ? dirname(importer) : process.cwd()],
      })}.js`;
    },
    load(id) {
      if (!id.startsWith(prefix)) return null;
      return `export default ${JSON.stringify(readFileSync(id.slice(prefix.length, -3)).toString("base64"))};`;
    },
  };
}
