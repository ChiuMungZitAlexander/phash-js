import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
for (const name of await readdir(dist)) {
  if (!name.endsWith(".d.ts")) continue;
  const declaration = await readFile(join(dist, name), "utf8");
  await writeFile(
    join(dist, name.replace(/\.d\.ts$/, ".d.cts")),
    declaration.replace(/(from\s+["']\.\.?\/[^"']+)\.js(["'])/g, "$1.cjs$2"),
  );
}
