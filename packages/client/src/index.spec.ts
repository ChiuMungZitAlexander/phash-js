import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { phash, HASH_PROFILE } from "./index.js";
import { phash as serverPhash } from "../../server/src/index.js";

test("hashes File and Blob bytes with the same profile as the server", async () => {
  const bytes = await readFile(new URL("../../server/images/lenna.png", import.meta.url));
  const fileBytes = Uint8Array.from(bytes);
  const file = new File([fileBytes], "misleading-name.jpg", { type: "image/jpeg" });
  const blob = new Blob([fileBytes], { type: "application/octet-stream" });
  const expected = await serverPhash(bytes);
  expect(HASH_PROFILE).toBe("phash-v2");
  expect(await phash(file)).toBe(expected);
  expect(await phash(blob)).toBe(expected);
});

test("rejects invalid files with a useful error", async () => {
  await expect(phash("./image.png" as never)).rejects.toThrow("Expected a File or Blob");
  await expect(phash(new Blob())).rejects.toThrow("Invalid image data");
  await expect(phash(new Blob(["not an image file"]))).rejects.toThrow("Unsupported image format");
});
