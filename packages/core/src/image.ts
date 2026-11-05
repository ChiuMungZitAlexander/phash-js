/** The canonical image/hash profile. Hashes from v1 must be regenerated. */
export const HASH_PROFILE = "phash-v2";

export interface RgbaImage {
  width: number;
  height: number;
  /** Unpremultiplied RGBA samples in the range 0..255. */
  data: Uint8Array | Uint8ClampedArray;
}

export const MAX_IMAGE_PIXELS = 100_000_000;

export function validateDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be positive integers");
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_PIXELS} pixel limit`);
  }
}

/** Apply the eight EXIF orientations to the decoded pixel grid. */
export function orientImage(image: RgbaImage, orientation: number): RgbaImage {
  if (orientation <= 1 || orientation > 8) return image;
  const { width, height, data } = image;
  const rotated = orientation >= 5;
  const outWidth = rotated ? height : width;
  const outHeight = rotated ? width : height;
  const output = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let outX = x;
      let outY = y;
      switch (orientation) {
        case 2:
          outX = width - 1 - x;
          break;
        case 3:
          outX = width - 1 - x;
          outY = height - 1 - y;
          break;
        case 4:
          outY = height - 1 - y;
          break;
        case 5:
          outX = y;
          outY = x;
          break;
        case 6:
          outX = height - 1 - y;
          outY = x;
          break;
        case 7:
          outX = height - 1 - y;
          outY = width - 1 - x;
          break;
        case 8:
          outX = y;
          outY = width - 1 - x;
          break;
      }
      const inputOffset = (y * width + x) * 4;
      output.set(data.subarray(inputOffset, inputOffset + 4), (outY * outWidth + outX) * 4);
    }
  }
  return { width: outWidth, height: outHeight, data: output };
}

// Integer floor(sqrt(numerator / 1000)); avoids runtime-specific transcendentals.
function hspGray(red: number, green: number, blue: number): number {
  const numerator = 299 * red * red + 587 * green * green + 114 * blue * blue;
  let low = 0;
  let high = 256;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (middle * middle * 1000 <= numerator) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * v2 preprocessing: composite RGBA over white, HSP grayscale, then area-resize.
 * Both axes stretch to the target square. Integer overlap weights make the
 * result independent of native image libraries and Canvas interpolation.
 */
export function preprocessImage(image: RgbaImage, size = 32): number[][] {
  const { width, height, data } = image;
  validateDimensions(width, height);
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray)) {
    throw new Error("RGBA data must contain 8-bit unsigned samples");
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > 1024) {
    throw new Error("Reduced size must be an integer between 1 and 1024");
  }
  if (data.length !== width * height * 4) {
    throw new Error("RGBA data length does not match image dimensions");
  }
  const gray = new Uint8Array(width * height);
  for (let pixel = 0; pixel < gray.length; pixel++) {
    const offset = pixel * 4;
    const alpha = data[offset + 3];
    const background = 255 * (255 - alpha);
    const red = Math.floor((data[offset] * alpha + background + 127) / 255);
    const green = Math.floor((data[offset + 1] * alpha + background + 127) / 255);
    const blue = Math.floor((data[offset + 2] * alpha + background + 127) / 255);
    gray[pixel] = hspGray(red, green, blue);
  }
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const area = width * height;
  for (let outY = 0; outY < size; outY++) {
    const top = outY * height;
    const bottom = top + height;
    for (let outX = 0; outX < size; outX++) {
      const left = outX * width;
      const right = left + width;
      let total = 0;
      for (let y = Math.floor(top / size); y < Math.ceil(bottom / size); y++) {
        const overlapY = Math.min(bottom, (y + 1) * size) - Math.max(top, y * size);
        for (let x = Math.floor(left / size); x < Math.ceil(right / size); x++) {
          const overlapX = Math.min(right, (x + 1) * size) - Math.max(left, x * size);
          total += gray[y * width + x] * overlapX * overlapY;
        }
      }
      matrix[outY][outX] = Math.floor((total + Math.floor(area / 2)) / area);
    }
  }
  return matrix;
}
