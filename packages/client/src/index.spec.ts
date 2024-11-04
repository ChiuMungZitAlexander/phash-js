import { expect, test } from "vitest";

import { phash } from "./";

test("phash should turn image to hex string", async () => {
  const hash = await phash("./images/lenna.png");

  expect(hash).toMatch(/^[0-9a-fA-F]{16}$/);
});
