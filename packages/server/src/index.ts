import { readFile } from "node:fs/promises";
import { hashImage } from "@phash-js/core";

export { calcDistance, HASH_PROFILE } from "@phash-js/core";

export type ImageInput = string | Uint8Array | ArrayBuffer;

/** Hash a file path or encoded PNG/JPEG/WebP bytes with the shared v2 codec. */
export async function phash(image: ImageInput): Promise<string> {
  let bytes: Uint8Array;
  if (typeof image === "string") bytes = await readFile(image);
  else if (image instanceof ArrayBuffer) bytes = new Uint8Array(image);
  else if (image instanceof Uint8Array) bytes = image;
  else throw new TypeError("Expected a file path, Uint8Array, Buffer, or ArrayBuffer");
  return hashImage(bytes);
}
