import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { phash, calcDistance, HASH_PROFILE } from "./index.js";

const fixture = (name: string) => fileURLToPath(new URL("../images/" + name, import.meta.url));

describe("server phash", () => {
  test("identifies the canonical hash profile", () => {
    expect(HASH_PROFILE).toBe("phash-v2");
  });

  test("hashes a path, Buffer, typed-array view, and ArrayBuffer identically", async () => {
    const bytes = await readFile(fixture("lenna.png"));
    const padded = new Uint8Array(bytes.length + 16);
    padded.set(bytes, 7);
    const view = padded.subarray(7, 7 + bytes.length);
    const hashes = await Promise.all([
      phash(fixture("lenna.png")),
      phash(bytes),
      phash(view),
      phash(view.slice().buffer),
    ]);
    expect(hashes[0]).toBe("99c4142500238280");
    expect(new Set(hashes).size).toBe(1);
  });

  test("is stable across repeated calls", async () => {
    const bytes = await readFile(fixture("lenna.png"));
    expect(await phash(bytes)).toBe(await phash(bytes));
  });

  test("keeps the resized and watermarked fixtures close", async () => {
    const original = await phash(fixture("lenna.png"));
    const smaller = await phash(fixture("lenna_small_size.png"));
    const watermark = await phash(fixture("lenna_watermark.png"));
    expect(calcDistance(original, smaller)).toBeLessThanOrEqual(4);
    expect(calcDistance(original, watermark)).toBeLessThanOrEqual(4);
  });

  test("distinguishes the altered and flipped fixtures", async () => {
    const original = await phash(fixture("lenna.png"));
    expect(calcDistance(original, await phash(fixture("lenna_old.png")))).toBeGreaterThan(5);
    expect(calcDistance(original, await phash(fixture("lenna_flipped.png")))).toBeGreaterThan(5);
  });

  test("decodes the existing WebP fixtures with the shared WASM codec", async () => {
    const [a, b] = await Promise.all([
      phash(fixture("ppg-2717.webp")),
      phash(fixture("ppg-2920.webp")),
    ]);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(b).toMatch(/^[0-9a-f]{16}$/);
    expect(calcDistance(a, b)).toBeGreaterThan(5);
  });

  test("rejects errors instead of swallowing them and returning undefined", async () => {
    await expect(phash(fixture("missing.png"))).rejects.toThrow();
    await expect(phash(new Uint8Array())).rejects.toThrow("Invalid image data");
    await expect(phash(new TextEncoder().encode("GIF89a unsupported"))).rejects.toThrow(
      "Unsupported image format",
    );
    await expect(phash(123 as never)).rejects.toThrow("Expected a file path");
  });
});
