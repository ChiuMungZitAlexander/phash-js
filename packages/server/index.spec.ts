import { expect, test } from "vitest";

import { phash, calcDistance } from "./";

test("phash should turn image to hex string", async () => {
  const hash = await phash("./images/lenna.png");

  expect(hash).toMatch(/^[0-9a-fA-F]{16}$/);
});

test("The same image should have the same fingerprint", async () => {
  const hash1 = await phash("./images/lenna.png");
  const hash2 = await phash("./images/lenna.png");

  expect(hash1).toBeTruthy();
  expect(hash2).toBeTruthy();

  const distance = calcDistance(hash1 as string, hash2 as string);

  expect(distance).toBe(0);
});

test("The same images with different sizes should have the same fingerprint", async () => {
  const hash1 = await phash("./images/lenna.png");
  const hash2 = await phash("./images/lenna_small_size.png");

  expect(hash1).toBeTruthy();
  expect(hash2).toBeTruthy();

  const distance = calcDistance(hash1 as string, hash2 as string);

  expect(distance).toBe(0);
});

test("Original image's fingerprint should have very short distance with a watermark one", async () => {
  const hash1 = await phash("./images/lenna.png");
  const hash2 = await phash("./images/lenna_watermark.png");

  expect(hash1).toBeTruthy();
  expect(hash2).toBeTruthy();

  const distance = calcDistance(hash1 as string, hash2 as string);

  expect(distance).toBeLessThan(2);
});

test("Similar images should have a intermediate distance", async () => {
  const hash1 = await phash("./images/lenna.png");
  const hash2 = await phash("./images/lenna_old.png");

  expect(hash1).toBeTruthy();
  expect(hash2).toBeTruthy();

  const distance = calcDistance(hash1 as string, hash2 as string);

  expect(distance).toBeGreaterThan(5);
});

test("Flipped images should have a long distance", async () => {
  const hash1 = await phash("./images/lenna.png");
  const hash2 = await phash("./images/lenna_flipped.png");

  expect(hash1).toBeTruthy();
  expect(hash2).toBeTruthy();

  const distance = calcDistance(hash1 as string, hash2 as string);

  expect(distance).toBeGreaterThan(5);
});

test("Even similar NFTs should have a long distance", async () => {
  const hash1 = await phash("./images/ppg-2717.webp");
  const hash2 = await phash("./images/ppg-2920.webp");

  expect(hash1).toBeTruthy();
  expect(hash2).toBeTruthy();

  const distance = calcDistance(hash1 as string, hash2 as string);

  expect(distance).toBeGreaterThan(5);
});
