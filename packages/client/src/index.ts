import { hashImage } from "@phash-js/core";

export { calcDistance, HASH_PROFILE } from "@phash-js/core";

/** Hash encoded PNG/JPEG/WebP bytes without using Canvas or native decoders. */
export async function phash(imageFile: File | Blob): Promise<string> {
  if (!imageFile || typeof imageFile.arrayBuffer !== "function") {
    throw new TypeError("Expected a File or Blob");
  }
  return hashImage(new Uint8Array(await imageFile.arrayBuffer()));
}
