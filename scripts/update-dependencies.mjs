import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootManifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const paths = [
  "package.json",
  ...rootManifest.workspaces.map((workspace) => `${workspace}/package.json`),
];
const manifests = await Promise.all(
  paths.map(async (path) => ({
    path,
    manifest: JSON.parse(await readFile(new URL(path, root), "utf8")),
  })),
);
const dependencies = [
  ...new Set(
    manifests.flatMap(({ manifest }) =>
      ["dependencies", "devDependencies", "optionalDependencies"].flatMap((kind) =>
        Object.entries(manifest[kind] ?? {})
          .filter(([, range]) => !range.startsWith("workspace:"))
          .map(([name]) => name),
      ),
    ),
  ),
].sort();
const versions = new Map(
  await Promise.all(
    dependencies.map(async (name) => {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
      if (!response.ok) throw new Error(`Failed to check ${name}: ${response.status}`);
      const { version } = await response.json();
      if (typeof version !== "string" || version.includes("-")) {
        throw new Error(`Expected a stable latest release for ${name}, got ${version}`);
      }
      return [name, version];
    }),
  ),
);
const check = process.argv.includes("--check");
let outdated = false;
for (const { path, manifest } of manifests) {
  for (const kind of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, range] of Object.entries(manifest[kind] ?? {})) {
      if (range.startsWith("workspace:")) continue;
      const version = versions.get(name);
      const next = /^\d/.test(range) ? version : `^${version}`;
      if (range !== next && range !== version) {
        outdated = true;
        console.log(`${path}: ${name} ${range} -> ${next}`);
      }
      manifest[kind][name] = next;
    }
  }
  if (!check) await writeFile(new URL(path, root), `${JSON.stringify(manifest, null, 2)}\n`);
}
if (check && outdated) process.exitCode = 1;
if (!outdated)
  console.log(`All ${versions.size} direct dependencies match the npm latest stable releases.`);
if (!check) {
  console.log(
    `Updated ${versions.size} direct dependencies in ${fileURLToPath(root)}. Run bun install to update bun.lock.`,
  );
}
