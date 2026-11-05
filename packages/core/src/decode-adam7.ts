import { decode as decodePng, type DecodedPng } from "fast-png";
import { unzlibSync, zlibSync } from "fflate";
import type { RgbaImage } from "./image.js";

const PASSES = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(data.length + 12);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) output[4 + i] = type.charCodeAt(i);
  output.set(data, 8);
  view.setUint32(output.length - 4, crc32(output.subarray(4, -4)));
  return output;
}

/**
 * fast-png 8.0.0 reads Adam7 samples below 8 bits as whole bytes. Decode each
 * packed pass through its working non-interlaced path, then scatter the RGBA
 * pixels. This reuses its filtering, palette, tRNS and sample conversion logic
 * instead of maintaining another PNG decoder.
 */
export function decodePackedAdam7(
  bytes: Uint8Array,
  toRgba: (png: DecodedPng) => RgbaImage,
): RgbaImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const depth = bytes[24];
  const colorType = bytes[25];
  if (![1, 2, 4].includes(depth) || (colorType !== 0 && colorType !== 3)) {
    throw new Error("Invalid PNG bit depth and color type");
  }
  const idat: Uint8Array[] = [];
  const metadata: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const end = offset + view.getUint32(offset) + 12;
    if (end > bytes.length) throw new Error("Truncated PNG chunk");
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) {
      throw new Error("CRC mismatch in Adam7 PNG");
    }
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === "IDAT") idat.push(bytes.subarray(offset + 8, end - 4));
    else if (type === "IEND") break;
    else if (type !== "IHDR") metadata.push(bytes.subarray(offset, end));
    else if (offset !== 8 || end !== 33) throw new Error("Invalid PNG IHDR chunk");
    offset = end;
  }
  const inflated = unzlibSync(concat(idat));
  const output = new Uint8Array(width * height * 4);
  let offset = 0;
  for (const [startX, startY, stepX, stepY] of PASSES) {
    const passWidth = Math.max(0, Math.ceil((width - startX) / stepX));
    const passHeight = Math.max(0, Math.ceil((height - startY) / stepY));
    if (!passWidth || !passHeight) continue;
    const length = (Math.ceil((passWidth * depth) / 8) + 1) * passHeight;
    if (offset + length > inflated.length) throw new Error("Invalid Adam7 scanline data");
    const header = Uint8Array.from(bytes.subarray(16, 29));
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, passWidth);
    headerView.setUint32(4, passHeight);
    header[12] = 0;
    const passPng = concat([
      bytes.subarray(0, 8),
      chunk("IHDR", header),
      ...metadata,
      chunk("IDAT", zlibSync(inflated.subarray(offset, offset + length), { level: 0 })),
      chunk("IEND", new Uint8Array()),
    ]);
    offset += length;
    const image = toRgba(decodePng(passPng, { checkCrc: true }));
    for (let y = 0; y < passHeight; y++) {
      for (let x = 0; x < passWidth; x++) {
        const source = (y * passWidth + x) * 4;
        const destination = ((startY + y * stepY) * width + startX + x * stepX) * 4;
        output.set(image.data.subarray(source, source + 4), destination);
      }
    }
  }
  if (offset !== inflated.length) throw new Error("Invalid Adam7 scanline data length");
  return { width, height, data: output };
}
