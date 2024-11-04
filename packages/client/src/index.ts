import {
  // dct2d,
  // cropDct2d,
  // binarize,
  calcDistance,
  DEFAULT_REDUCED_SIZE,
  // BIN_GROUP_SIZE,
} from "@phash-js/core";

const phash = async (imageUrl: string) => {
  try {
    const image = new Image();
    image.src = imageUrl;

    await new Promise((resolve) => (image.onload = resolve));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas context is null");
    }

    // greyscale
    ctx.filter = "grayscale(1)";

    // Reduce image size
    ctx.drawImage(image, 0, 0, DEFAULT_REDUCED_SIZE, DEFAULT_REDUCED_SIZE);

    // Convert canvas to Blob for buffer-like data
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve)
    );

    if (!blob) {
      throw new Error("Blob is null when converting canvas to blob");
    }

    const arrayBuffer = await blob.arrayBuffer();

    console.log("-->", new Uint8Array(arrayBuffer));
  } catch (err) {
    console.error(err);
  }
};

export { phash, calcDistance };
