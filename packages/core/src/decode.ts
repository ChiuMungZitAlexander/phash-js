import { convertIndexedToRgb, decode as decodePng, type DecodedPng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";
import decodeWebp, { init as initWebp } from "@jsquash/webp/decode.js";
import webpWasm from "@jsquash/webp/codec/dec/webp_dec.wasm?base64";
import { orientImage, validateDimensions, type RgbaImage } from "./image.js";
import { decodePackedAdam7 } from "./decode-adam7.js";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
let webpReady: Promise<void> | undefined;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

// Invalid/missing EXIF is treated as orientation 1; metadata never selects a
// platform decoder or a color-management path.
function exifOrientation(bytes: Uint8Array): number {
  const start = ascii(bytes, 0, 6) === "Exif\0\0" ? 6 : 0;
  if (bytes.length < start + 8) return 1;
  const byteOrder = ascii(bytes, start, 2);
  if (byteOrder !== "II" && byteOrder !== "MM") return 1;
  const little = byteOrder === "II";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(start + 2, little) !== 42) return 1;
  const directory = start + view.getUint32(start + 4, little);
  if (directory < start + 8 || directory + 2 > bytes.length) return 1;
  const entries = view.getUint16(directory, little);
  for (let i = 0; i < entries; i++) {
    const entry = directory + 2 + i * 12;
    if (entry + 12 > bytes.length) return 1;
    if (
      view.getUint16(entry, little) === 0x0112 &&
      view.getUint16(entry + 2, little) === 3 &&
      view.getUint32(entry + 4, little) === 1
    ) {
      const orientation = view.getUint16(entry + 8, little);
      return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }
  }
  return 1;
}

function inspectPng(bytes: Uint8Array): number {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== "IHDR") throw new Error("Invalid PNG header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  validateDimensions(view.getUint32(16), view.getUint32(20));
  let orientation = 1;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("Truncated PNG chunk");
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") throw new Error("Animated PNG is not supported");
    if (type === "eXIf") orientation = exifOrientation(bytes.subarray(offset + 8, end - 4));
    if (type === "IEND") return orientation;
    offset = end;
  }
  throw new Error("PNG is missing its IEND chunk");
}

function pngToRgba(png: DecodedPng): RgbaImage {
  const { width, height, depth, transparency } = png;
  const palette = png.palette;
  const samples = palette ? convertIndexedToRgb(png) : png.data;
  const channels = palette ? palette[0].length : png.channels;
  const sampleDepth = palette ? 8 : depth;
  const maximum = (1 << sampleDepth) - 1;
  const rgba = new Uint8Array(width * height * 4);
  const rowBytes = Math.ceil((width * channels * sampleDepth) / 8);
  const sampleAt = (x: number, y: number, channel: number): number => {
    if (sampleDepth >= 8) return samples[(y * width + x) * channels + channel];
    const bit = (x * channels + channel) * sampleDepth;
    return (samples[y * rowBytes + (bit >>> 3)] >>> (8 - sampleDepth - (bit & 7))) & maximum;
  };
  const scale = (sample: number) => Math.floor((sample * 255 + Math.floor(maximum / 2)) / maximum);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = sampleAt(x, y, 0);
      const g = channels <= 2 ? r : sampleAt(x, y, 1);
      const b = channels <= 2 ? r : sampleAt(x, y, 2);
      rgba[offset] = scale(r);
      rgba[offset + 1] = scale(g);
      rgba[offset + 2] = scale(b);
      rgba[offset + 3] =
        channels === 2 || channels === 4 ? scale(sampleAt(x, y, channels - 1)) : 255;
      if (
        !palette &&
        transparency &&
        ((channels === 1 && r === transparency[0]) ||
          (channels === 3 &&
            r === transparency[0] &&
            g === transparency[1] &&
            b === transparency[2]))
      ) {
        rgba[offset + 3] = 0;
      }
    }
  }
  return { width, height, data: rgba };
}

function inspectJpeg(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let dimensionsFound = false;
  for (let offset = 2; offset + 1 < bytes.length;) {
    if (bytes[offset++] !== 0xff) throw new Error("Invalid JPEG marker");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) throw new Error("Truncated JPEG segment");
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("Invalid JPEG segment length");
    if (marker === 0xe1 && ascii(bytes, offset + 2, 6) === "Exif\0\0") {
      orientation = exifOrientation(bytes.subarray(offset + 2, offset + length));
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 8) throw new Error("Invalid JPEG frame header");
      validateDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      dimensionsFound = true;
    }
    offset += length;
  }
  if (!dimensionsFound) throw new Error("JPEG is missing its frame header");
  return orientation;
}

function inspectWebp(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > bytes.length || riffEnd < 12) throw new Error("Invalid WebP RIFF length");
  let orientation = 1;
  let dimensionsFound = false;
  for (let offset = 12; offset + 8 <= riffEnd;) {
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end > riffEnd) throw new Error("Truncated WebP chunk");
    if (
      type === "ANIM" ||
      type === "ANMF" ||
      (type === "VP8X" && length >= 1 && bytes[start] & 2)
    ) {
      throw new Error("Animated WebP is not supported");
    }
    if (type === "EXIF") orientation = exifOrientation(bytes.subarray(start, end));
    if (type === "VP8X" && length >= 10) {
      const width = 1 + bytes[start + 4] + bytes[start + 5] * 256 + bytes[start + 6] * 65536;
      const height = 1 + bytes[start + 7] + bytes[start + 8] * 256 + bytes[start + 9] * 65536;
      validateDimensions(width, height);
      dimensionsFound = true;
    } else if (type === "VP8 " && length >= 10) {
      validateDimensions(
        view.getUint16(start + 6, true) & 0x3fff,
        view.getUint16(start + 8, true) & 0x3fff,
      );
      dimensionsFound = true;
    } else if (type === "VP8L" && length >= 5 && bytes[start] === 0x2f) {
      const bits = view.getUint32(start + 1, true);
      validateDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      dimensionsFound = true;
    }
    offset = end + (length & 1);
  }
  if (!dimensionsFound) throw new Error("WebP is missing its image header");
  return orientation;
}

/**
 * Decode the same encoded bytes with the same JS/WASM codecs in every runtime.
 * ICC profiles and gamma metadata are deliberately not applied. Animated images
 * and formats outside PNG/JPEG/WebP are rejected instead of using a native fallback.
 */
export async function decodeImage(bytes: Uint8Array): Promise<RgbaImage> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) throw new Error("Invalid image data");
  let image: RgbaImage;
  let orientation: number;
  if (PNG_SIGNATURE.every((value, i) => bytes[i] === value)) {
    orientation = inspectPng(bytes);
    image =
      bytes[28] === 1 && bytes[24] < 8
        ? decodePackedAdam7(bytes, pngToRgba)
        : pngToRgba(decodePng(bytes, { checkCrc: true }));
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    orientation = inspectJpeg(bytes);
    image = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: 100,
      maxMemoryUsageInMB: 512,
    });
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    orientation = inspectWebp(bytes);
    if (!webpReady) {
      const options = {
        wasmBinary: Uint8Array.from(atob(webpWasm), (c) => c.charCodeAt(0)),
        // The bytes are embedded; avoid import.meta.url / asset URL requirements
        // in CommonJS, workers, and consuming applications' bundlers.
        locateFile: () => "webp_dec.wasm",
      };
      webpReady = initWebp(options);
    }
    await webpReady;
    const buffer = new Uint8Array(bytes).buffer;
    image = await decodeWebp(buffer);
  } else {
    throw new Error("Unsupported image format; expected PNG, JPEG, or static WebP");
  }
  validateDimensions(image.width, image.height);
  if (image.data.length !== image.width * image.height * 4)
    throw new Error("Invalid decoded RGBA data");
  return orientImage(image, orientation);
}
