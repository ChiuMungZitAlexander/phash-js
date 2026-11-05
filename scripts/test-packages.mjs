import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esmCore = await import("@phash-js/core");
const cjsCore = require("@phash-js/core");
const esmServer = await import("@phash-js/server");
const cjsServer = require("@phash-js/server");
const esmClient = await import("@phash-js/client");
const cjsClient = require("@phash-js/client");

for (const name of ["lenna.png", "ppg-2717.webp"]) {
  const path = new URL(`../packages/server/images/${name}`, import.meta.url);
  const bytes = await readFile(path);
  const blob = new Blob([bytes]);
  const hashes = await Promise.all([
    esmCore.hashImage(bytes),
    cjsCore.hashImage(bytes),
    esmServer.phash(bytes),
    cjsServer.phash(bytes),
    esmClient.phash(blob),
    cjsClient.phash(blob),
  ]);
  assert.match(hashes[0], /^[0-9a-f]{16}$/);
  for (const hash of hashes) assert.equal(hash, hashes[0], `${name}: package exports disagree`);
  assert.equal(esmCore.HASH_PROFILE, cjsCore.HASH_PROFILE);
  assert.equal(esmServer.calcDistance(hashes[0], hashes[0]), 0);
  console.log(`${name}: ESM and CommonJS core/server/client agree (${hashes[0]})`);
}
