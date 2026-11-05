import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { transform } from "oxc-transform";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const dependencies = Object.keys(manifest.dependencies ?? {});

export default {
  input: "src/index.ts",
  output: [
    { file: "dist/index.cjs", format: "cjs", sourcemap: true },
    { file: "dist/index.mjs", format: "esm", sourcemap: true },
  ],
  plugins: [
    resolve({
      browser: manifest.name !== "@phash-js/server",
      preferBuiltins: manifest.name === "@phash-js/server",
    }),
    commonjs(),
    {
      name: "oxc-typescript",
      resolveId(source, importer) {
        if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
        const candidate = resolvePath(dirname(importer), source.replace(/\.js$/, ".ts"));
        return existsSync(candidate) ? candidate : null;
      },
      async transform(code, id) {
        if (!/\.[cm]?tsx?$/.test(id)) return null;
        const result = await transform(id, code, { target: "es2022", sourcemap: true });
        if (result.errors.length) {
          this.error(result.errors.map((error) => error.message).join("\n"));
        }
        return { code: result.code, map: result.map };
      },
    },
  ],
  external: (id) =>
    id.startsWith("node:") ||
    dependencies.some((dependency) => id === dependency || id.startsWith(`${dependency}/`)),
};
