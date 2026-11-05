import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

export interface RegressionImage {
  name: string;
  mimeType: string;
  bytes: () => Promise<Buffer>;
}

const imageDirectory = new URL("../../packages/server/images/", import.meta.url);
const lenna = () => readFile(new URL("lenna.png", imageDirectory));

// Asymmetric, non-square content makes cropping, transposition and alpha bugs visible.
export function pattern(width = 83, height = 47, transparent = false) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      data[index] = (x * 17 + y * 3) % 256;
      data[index + 1] = (x * 5 + y * 23) % 256;
      data[index + 2] = x < width / 3 ? 255 : (y * 11) % 256;
      data[index + 3] = transparent ? (x * 7 + y * 13) % 256 : 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

export const regressionImages: RegressionImage[] = [
  { name: "lenna.png", mimeType: "image/png", bytes: lenna },
  ...["lenna_small_size.png", "lenna_flipped.png", "lenna_watermark.png"].map((name) => ({
    name,
    mimeType: "image/png",
    bytes: () => readFile(new URL(name, imageDirectory)),
  })),
  ...["ppg-2717.webp", "ppg-2920.webp"].map((name) => ({
    name,
    mimeType: "image/webp",
    bytes: () => readFile(new URL(name, imageDirectory)),
  })),
  {
    name: "non-square-rgb.png",
    mimeType: "image/png",
    bytes: () => pattern().removeAlpha().png().toBuffer(),
  },
  {
    name: "transparent-rgba.png",
    mimeType: "image/png",
    bytes: () => pattern(83, 47, true).png().toBuffer(),
  },
  {
    name: "grayscale.png",
    mimeType: "image/png",
    bytes: () => pattern().removeAlpha().toColourspace("b-w").png().toBuffer(),
  },
  {
    name: "palette-transparency.png",
    mimeType: "image/png",
    bytes: () => pattern(83, 47, true).png({ palette: true, colours: 16, dither: 0 }).toBuffer(),
  },
  {
    name: "rgb16.png",
    mimeType: "image/png",
    bytes: () => pattern().removeAlpha().toColourspace("rgb16").png().toBuffer(),
  },
  {
    name: "one-pixel.png",
    mimeType: "image/png",
    bytes: () => pattern(1, 1).png().toBuffer(),
  },
  {
    name: "portrait.png",
    mimeType: "image/png",
    bytes: () => pattern(19, 91).png().toBuffer(),
  },
  {
    name: "lenna-baseline.jpg",
    mimeType: "image/jpeg",
    bytes: async () =>
      sharp(await lenna())
        .jpeg({ quality: 91 })
        .toBuffer(),
  },
  {
    name: "lenna-progressive.jpg",
    mimeType: "image/jpeg",
    bytes: async () =>
      sharp(await lenna())
        .jpeg({ quality: 87, progressive: true })
        .toBuffer(),
  },
  ...Array.from({ length: 8 }, (_, index) => ({
    name: `orientation-${index + 1}.jpg`,
    mimeType: "image/jpeg",
    bytes: () =>
      pattern()
        .withMetadata({ orientation: index + 1 })
        .jpeg()
        .toBuffer(),
  })),
  {
    name: "webp-lossless-alpha.webp",
    mimeType: "image/webp",
    bytes: () => pattern(83, 47, true).webp({ lossless: true }).toBuffer(),
  },
  {
    name: "webp-lossy-alpha.webp",
    mimeType: "image/webp",
    bytes: () => pattern(83, 47, true).webp({ quality: 73 }).toBuffer(),
  },
];

export const originalLennaPath = fileURLToPath(new URL("lenna.png", imageDirectory));

function pngChunk(type: string, data: Buffer) {
  const payload = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = 0xffffffff;
  for (const value of payload) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, checksum]);
}

/** Equivalent low-bit-depth and 8-bit grayscale files, including padded scanlines. */
export async function grayscalePair(depth: 1 | 2 | 4) {
  const width = 83;
  const height = 47;
  const maximum = (1 << depth) - 1;
  const stride = 1 + Math.ceil((width * depth) / 8);
  const packedRows = Buffer.alloc(stride * height);
  const unpacked = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = (x * 3 + y * 7) & maximum;
      const bit = x * depth;
      packedRows[y * stride + 1 + (bit >>> 3)] |= value << (8 - depth - (bit & 7));
      unpacked[y * width + x] = value * (255 / maximum);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  const packed = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(packedRows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const eightBit = await sharp(unpacked, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  return { packed, eightBit };
}
