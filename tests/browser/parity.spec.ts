import { expect, test, type Page } from "@playwright/test";
import { phash as serverPhash } from "@phash-js/server";
import sharp from "sharp";
import { regressionImages, pattern, grayscalePair } from "../fixtures/images";

async function browserPhash(page: Page, bytes: Uint8Array, name: string, mimeType: string) {
  return page.evaluate(
    async ({ data, name, mimeType }) => {
      const file = new File([new Uint8Array(data)], name, { type: mimeType });
      return window.clientPhash(file);
    },
    { data: Array.from(bytes), name, mimeType },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/");
  await page.waitForFunction(() => typeof window.clientPhash === "function");
});

for (const image of regressionImages) {
  test(`identical file bytes produce identical hashes: ${image.name}`, async ({ page }) => {
    const bytes = await image.bytes();
    const expected = await serverPhash(bytes);
    expect(expected).toMatch(/^[0-9a-f]{16}$/);
    if (image.name === "lenna.png") expect(expected).toBe("99c4142500238280");
    expect(await browserPhash(page, bytes, image.name, image.mimeType)).toBe(expected);
  });
}

for (const depth of [1, 2, 4] as const) {
  test(`${depth}-bit grayscale PNG agrees with its 8-bit pixel equivalent`, async ({ page }) => {
    const { packed, eightBit } = await grayscalePair(depth);
    const expected = await serverPhash(eightBit);
    expect(await serverPhash(packed)).toBe(expected);
    expect(await browserPhash(page, packed, `grayscale-${depth}.png`, "image/png")).toBe(expected);
  });
}

test("ignores filename and MIME labels when detecting image format", async ({ page }) => {
  const bytes = await regressionImages[0].bytes();
  expect(await browserPhash(page, bytes, "wrong.jpg", "application/octet-stream")).toBe(
    await serverPhash(bytes),
  );
});

test("does not depend on Canvas, Image or object-URL image decoding", async ({ page }) => {
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.getContext = () => {
      throw new Error("Canvas decoding must not be used");
    };
    URL.createObjectURL = () => {
      throw new Error("Native image decoding must not be used");
    };
    window.Image = class {
      constructor() {
        throw new Error("Native image decoding must not be used");
      }
    } as unknown as typeof Image;
  });
  const bytes = await regressionImages[0].bytes();
  expect(await browserPhash(page, bytes, "lenna.png", "image/png")).toBe(await serverPhash(bytes));
});

test("WebP decoding needs no external WASM download", async ({ page, context }) => {
  const bytes = await regressionImages.find((image) => image.name === "ppg-2717.webp")!.bytes();
  const expected = await serverPhash(bytes);
  await context.setOffline(true);
  expect(await browserPhash(page, bytes, "offline.webp", "image/webp")).toBe(expected);
});

test("PNG EXIF orientation agrees with physically rotating the pixels", async ({ page }) => {
  const tagged = await pattern().withMetadata({ orientation: 6 }).png().toBuffer();
  const rotated = await pattern().rotate(90).png().toBuffer();
  const expected = await serverPhash(rotated);
  expect(await serverPhash(tagged)).toBe(expected);
  expect(await browserPhash(page, tagged, "tagged.png", "image/png")).toBe(expected);
});

test("fully transparent RGB content is composited on white", async ({ page }) => {
  const source = await pattern().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < source.data.length; i += 4) source.data[i] = 0;
  const hiddenColours = await sharp(source.data, { raw: source.info }).png().toBuffer();
  const white = await sharp({
    create: { width: 83, height: 47, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  const expected = await serverPhash(white);
  expect(await serverPhash(hiddenColours)).toBe(expected);
  expect(await browserPhash(page, hiddenColours, "transparent.png", "image/png")).toBe(expected);
});

for (const invalid of [
  { name: "empty.png", data: [] },
  { name: "text.png", data: Array.from(new TextEncoder().encode("this is not an image")) },
  { name: "truncated.png", data: [137, 80, 78, 71, 13, 10, 26, 10] },
]) {
  test(`rejects invalid input: ${invalid.name}`, async ({ page }) => {
    await expect(serverPhash(Buffer.from(invalid.data))).rejects.toThrow();
    const error = await page.evaluate(async ({ name, data }) => {
      try {
        await window.clientPhash(new File([new Uint8Array(data)], name, { type: "image/png" }));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, invalid);
    expect(error).toBeTruthy();
  });
}
