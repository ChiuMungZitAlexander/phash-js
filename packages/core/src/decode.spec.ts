import { encode } from "fast-png";
import { encode as encodeJpeg } from "jpeg-js";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { decodeImage, hashImage, hashRgbaImage, orientImage } from "./index.js";

function exif(orientation: number): Uint8Array {
  const result = new Uint8Array(26);
  const view = new DataView(result.buffer);
  result.set([73, 73, 42, 0, 8, 0, 0, 0, 1, 0]);
  view.setUint16(10, 0x0112, true);
  view.setUint16(12, 3, true);
  view.setUint32(14, 1, true);
  view.setUint16(18, orientation, true);
  return result;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(new TextEncoder().encode(type), 4);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(arrays.reduce((length, array) => length + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function app1(data: Uint8Array): Uint8Array {
  const header = Uint8Array.from([255, 225, 0, 0]);
  new DataView(header.buffer).setUint16(2, data.length + 2);
  return concat(header, data);
}

// Independent packed Adam7 fixture encoder. Odd dimensions exercise padding;
// all five PNG filters exercise scanline state being reset between passes.
function packedAdam7(depth: number, indexed: boolean, truncate = false) {
  const width = 11;
  const height = 9;
  const maximum = (1 << depth) - 1;
  const samples = Array.from(
    { length: width * height },
    (_, i) => (i * 7 + Math.floor(i / width) * 3) & maximum,
  );
  const palette = Array.from({ length: maximum + 1 }, (_, i) => [
    i * 17,
    255 - i * 17,
    (i * 37) & 255,
  ]);
  const alpha = Array.from({ length: maximum + 1 }, (_, i) => (i === 0 ? 0 : (i * 255) / maximum));
  const expected = Uint8Array.from(
    samples.flatMap((sample) =>
      indexed
        ? [...palette[sample], Math.floor(alpha[sample])]
        : [
            ...Array<number>(3).fill(Math.round((sample * 255) / maximum)),
            sample === maximum ? 0 : 255,
          ],
    ),
  );
  const scanlines: number[] = [];
  for (const [passIndex, [startX, startY, stepX, stepY]] of [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ].entries()) {
    const passWidth = Math.max(0, Math.ceil((width - startX) / stepX));
    const passHeight = Math.max(0, Math.ceil((height - startY) / stepY));
    if (!passWidth || !passHeight) continue;
    const previous = new Uint8Array(Math.ceil((passWidth * depth) / 8));
    for (let y = 0; y < passHeight; y++) {
      const row = new Uint8Array(Math.ceil((passWidth * depth) / 8));
      for (let x = 0; x < passWidth; x++) {
        const sample = samples[(startY + y * stepY) * width + startX + x * stepX];
        const bit = x * depth;
        row[bit >>> 3] |= sample << (8 - depth - (bit & 7));
      }
      const filter = (passIndex + y) % 5;
      scanlines.push(filter);
      for (let i = 0; i < row.length; i++) {
        const left = i ? row[i - 1] : 0;
        const up = previous[i];
        const upperLeft = i ? previous[i - 1] : 0;
        const p = left + up - upperLeft;
        const paeth =
          Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upperLeft)
            ? left
            : Math.abs(p - up) <= Math.abs(p - upperLeft)
              ? up
              : upperLeft;
        const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
        scanlines.push((row[i] - predictor) & 255);
      }
      previous.set(row);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([depth, indexed ? 3 : 0, 0, 0, 1], 8);
  const metadata = indexed
    ? [pngChunk("PLTE", Uint8Array.from(palette.flat())), pngChunk("tRNS", Uint8Array.from(alpha))]
    : [pngChunk("tRNS", Uint8Array.from([0, maximum]))];
  const png = concat(
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    ...metadata,
    pngChunk("IDAT", deflateSync(Uint8Array.from(truncate ? scanlines.slice(0, -1) : scanlines))),
    pngChunk("IEND", new Uint8Array()),
  );
  return { png, expected, width, height };
}

describe("shared image decoding", () => {
  test.each([1, 2, 4])("decodes packed Adam7 grayscale at %i bits with tRNS", async (depth) => {
    const { png, expected, width, height } = packedAdam7(depth, false);
    // Buffer is a Uint8Array subclass whose slice returns a view.
    const input = Buffer.from(png);
    const original = Buffer.from(input);
    expect((await decodeImage(input)).data).toEqual(expected);
    expect(input).toEqual(original);
    expect(await hashImage(input)).toBe(hashRgbaImage({ width, height, data: expected }));
  });

  test.each([1, 2, 4])(
    "decodes packed Adam7 indexed PNG at %i bits with palette alpha",
    async (depth) => {
      const { png, expected, width, height } = packedAdam7(depth, true);
      const decoded = await decodeImage(png);
      expect([decoded.width, decoded.height]).toEqual([width, height]);
      expect(decoded.data).toEqual(expected);
    },
  );

  test("checks original Adam7 CRCs and rejects short packed scanline streams", async () => {
    const { png } = packedAdam7(2, false);
    png[29] ^= 1;
    await expect(decodeImage(png)).rejects.toThrow("CRC mismatch");
    await expect(decodeImage(packedAdam7(2, false, true).png)).rejects.toThrow(
      "Invalid Adam7 scanline data",
    );
  });

  test("preserves RGB and alpha samples without platform color conversion", async () => {
    const data = Uint8Array.from([200, 30, 60, 128, 4, 8, 12, 0]);
    const png = encode({ width: 2, height: 1, data, channels: 4 });
    const image = await decodeImage(png);
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect(image.data).toEqual(data);
    expect(await hashImage(png)).toBe(hashRgbaImage({ width: 2, height: 1, data }));
  });

  test("expands grayscale-alpha PNG to RGBA", async () => {
    const png = encode({
      width: 2,
      height: 1,
      channels: 2,
      data: Uint8Array.from([70, 255, 200, 128]),
    });
    expect((await decodeImage(png)).data).toEqual(
      Uint8Array.from([70, 70, 70, 255, 200, 200, 200, 128]),
    );
  });

  test("scales 16-bit PNG samples deterministically to 8 bits", async () => {
    const png = encode({
      width: 2,
      height: 1,
      channels: 4,
      depth: 16,
      data: Uint16Array.from([65535, 32768, 0, 65535, 257, 514, 771, 32896]),
    });
    expect((await decodeImage(png)).data).toEqual(
      Uint8Array.from([255, 128, 0, 255, 1, 2, 3, 128]),
    );
  });

  test("honors PNG sample transparency before reducing bit depth", async () => {
    const plain = encode({
      width: 2,
      height: 1,
      channels: 1,
      depth: 16,
      data: Uint16Array.from([257, 258]),
    });
    // fast-png's encoder does not emit tRNS; insert a spec-compliant chunk.
    const png = concat(
      plain.subarray(0, 33),
      pngChunk("tRNS", Uint8Array.from([1, 1])),
      plain.subarray(33),
    );
    const decoded = await decodeImage(png);
    expect(decoded.data).toEqual(Uint8Array.from([1, 1, 1, 0, 1, 1, 1, 255]));
  });

  test("reads the exact range of a Uint8Array view", async () => {
    const png = encode({ width: 1, height: 1, channels: 3, data: Uint8Array.from([8, 16, 32]) });
    const padded = new Uint8Array(png.length + 10);
    padded.set(png, 4);
    expect((await decodeImage(padded.subarray(4, 4 + png.length))).data).toEqual(
      Uint8Array.from([8, 16, 32, 255]),
    );
  });

  test("applies PNG EXIF orientation and safely ignores malformed TIFF offsets", async () => {
    const png = encode({
      width: 2,
      height: 1,
      channels: 3,
      data: Uint8Array.from([255, 0, 0, 0, 0, 255]),
    });
    const original = await decodeImage(png);
    const oriented = concat(png.subarray(0, 33), pngChunk("eXIf", exif(6)), png.subarray(33));
    expect(await decodeImage(oriented)).toEqual(orientImage(original, 6));
    const broken = exif(6);
    new DataView(broken.buffer).setUint32(4, 0xffffffff, true);
    const malformed = concat(png.subarray(0, 33), pngChunk("eXIf", broken), png.subarray(33));
    expect(await decodeImage(malformed)).toEqual(original);
  });

  test("keeps JPEG orientation when a later APP1 segment contains XMP", async () => {
    const jpeg = Uint8Array.from(
      encodeJpeg(
        {
          width: 2,
          height: 1,
          data: Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]),
        },
        90,
      ).data,
    );
    const tagged = concat(
      jpeg.subarray(0, 2),
      app1(concat(new TextEncoder().encode("Exif\u0000\u0000"), exif(6))),
      app1(new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\u0000xmp")),
      jpeg.subarray(2),
    );
    expect(await decodeImage(tagged)).toEqual(orientImage(await decodeImage(jpeg), 6));
  });

  test("rejects animated containers instead of selecting a runtime-dependent frame", async () => {
    const png = encode({ width: 1, height: 1, channels: 3, data: Uint8Array.from([8, 16, 32]) });
    const animation = concat(
      png.subarray(0, 33),
      pngChunk("acTL", new Uint8Array(8)),
      png.subarray(33),
    );
    await expect(decodeImage(animation)).rejects.toThrow("Animated PNG");
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
    const view = new DataView(webp.buffer);
    view.setUint32(4, 22, true);
    view.setUint32(16, 10, true);
    webp[20] = 2;
    await expect(decodeImage(webp)).rejects.toThrow("Animated WebP");
  });

  test("checks CRCs and rejects truncated files", async () => {
    const png = encode({ width: 1, height: 1, channels: 3, data: Uint8Array.from([8, 16, 32]) });
    const badCrc = png.slice();
    badCrc[29] ^= 1;
    await expect(decodeImage(badCrc)).rejects.toThrow();
    await expect(decodeImage(png.subarray(0, png.length - 1))).rejects.toThrow();
  });

  test("rejects excessive dimensions before allocating decoded pixels", async () => {
    const png = encode({ width: 1, height: 1, channels: 3, data: Uint8Array.from([8, 16, 32]) });
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    view.setUint32(16, 10_001);
    view.setUint32(20, 10_000);
    await expect(decodeImage(png)).rejects.toThrow("pixel limit");
  });

  test("rejects unsupported formats and malformed container headers", async () => {
    await expect(decodeImage(new Uint8Array())).rejects.toThrow("Invalid image data");
    await expect(decodeImage(new TextEncoder().encode("GIF89a unsupported"))).rejects.toThrow(
      "Unsupported image format",
    );
    await expect(
      decodeImage(Uint8Array.from([255, 216, 255, 225, 0, 20, 0, 0, 0, 0, 0, 0])),
    ).rejects.toThrow("Invalid JPEG segment length");
    const webp = new TextEncoder().encode("RIFF\u0004\u0000\u0000\u0000WEBP");
    await expect(decodeImage(webp)).rejects.toThrow("missing its image header");
  });
});
