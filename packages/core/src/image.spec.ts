import { describe, expect, test } from "vitest";
import { dct1d, hashRgbaImage, preprocessImage, orientImage } from "./index.js";
import type { RgbaImage } from "./image.js";

const rgba = (width: number, height: number, values: number[]): RgbaImage => ({
  width,
  height,
  data: Uint8Array.from(values),
});
const gray = (width: number, height: number, values: number[]) =>
  rgba(
    width,
    height,
    values.flatMap((value) => [value, value, value, 255]),
  );

describe("canonical preprocessing", () => {
  test("uses HSP weighted root-mean-square grayscale, not Rec.601 luma", () => {
    const image = rgba(3, 1, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    expect(preprocessImage(image, 3)).toEqual([
      [139, 195, 86],
      [139, 195, 86],
      [139, 195, 86],
    ]);
  });

  test("composites transparent pixels over white and ignores hidden RGB", () => {
    expect(preprocessImage(rgba(1, 1, [255, 0, 0, 0]), 1)).toEqual([[255]]);
    expect(preprocessImage(rgba(1, 1, [0, 255, 0, 0]), 1)).toEqual([[255]]);
    expect(preprocessImage(rgba(1, 1, [255, 0, 0, 128]), 1)).toEqual([[175]]);
  });

  test("uses exact area coverage and rounds once at the output pixel", () => {
    expect(preprocessImage(gray(2, 1, [0, 255]), 1)).toEqual([[128]]);
    expect(preprocessImage(gray(3, 1, [0, 0, 255]), 1)).toEqual([[85]]);
    expect(preprocessImage(gray(2, 1, [0, 255]), 3)).toEqual([
      [0, 128, 255],
      [0, 128, 255],
      [0, 128, 255],
    ]);
  });

  test("stretches non-square images without cropping the edges", () => {
    expect(preprocessImage(gray(4, 2, [0, 100, 200, 255, 0, 100, 200, 255]), 2)).toEqual([
      [50, 228],
      [50, 228],
    ]);
  });

  test("validates dimensions, raw pixel length, and reduced size", () => {
    expect(() => preprocessImage(rgba(0, 1, []))).toThrow("positive integers");
    expect(() => preprocessImage(rgba(1.5, 1, []))).toThrow("positive integers");
    expect(() => preprocessImage(rgba(10_001, 10_000, []))).toThrow("pixel limit");
    expect(() => preprocessImage(rgba(1, 1, [0]))).toThrow("RGBA data length");
    expect(() =>
      preprocessImage({ width: 1, height: 1, data: new Uint16Array(4) as never }),
    ).toThrow("8-bit unsigned samples");
    expect(() => preprocessImage(gray(1, 1, [0]), 0)).toThrow("Reduced size");
  });
});

describe("EXIF pixel orientation", () => {
  const image = gray(3, 2, [1, 2, 3, 4, 5, 6]);
  test.each([
    [1, 3, 2, [1, 2, 3, 4, 5, 6]],
    [2, 3, 2, [3, 2, 1, 6, 5, 4]],
    [3, 3, 2, [6, 5, 4, 3, 2, 1]],
    [4, 3, 2, [4, 5, 6, 1, 2, 3]],
    [5, 2, 3, [1, 4, 2, 5, 3, 6]],
    [6, 2, 3, [4, 1, 5, 2, 6, 3]],
    [7, 2, 3, [6, 3, 5, 2, 4, 1]],
    [8, 2, 3, [3, 6, 2, 5, 1, 4]],
  ])("applies orientation %i", (orientation, width, height, expected) => {
    const result = orientImage(image, orientation as number);
    expect([result.width, result.height]).toEqual([width, height]);
    expect(Array.from(result.data).filter((_, i) => i % 4 === 0)).toEqual(expected);
  });
});

test("32-point DCT has the expected DC coefficient and no spurious frequencies", () => {
  const result = dct1d(Array<number>(32).fill(100));
  expect(result[0]).toBeCloseTo(565.68542495, 8);
  expect(result.slice(1).every((value) => value === 0)).toBe(true);
});

test("canonical solid colors and transparent white produce stable hashes", () => {
  expect(hashRgbaImage(gray(1, 1, [0]))).toBe("ffffffffffffffff");
  expect(hashRgbaImage(gray(1, 1, [255]))).toBe("8000000000000000");
  expect(hashRgbaImage(rgba(1, 1, [255, 0, 0, 0]))).toBe("8000000000000000");
});
