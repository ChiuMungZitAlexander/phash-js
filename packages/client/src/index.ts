import {
  dct2d,
  cropDct2d,
  binarize,
  calcDistance,
  DEFAULT_REDUCED_SIZE,
  BIN_GROUP_SIZE,
} from "@phash-js/core";
import chunk from "lodash/chunk";

/**
 *
 * @param file
 * @returns
 */
const loadImage = async (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };

    img.onerror = reject;
  });

/**
 * @phash-js/client
 * @param imageFile
 * @returns
 */
const phash = async (imageFile: File): Promise<string> => {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas context is null");
    }

    const image = await loadImage(imageFile);

    ctx.drawImage(image, 0, 0, DEFAULT_REDUCED_SIZE, DEFAULT_REDUCED_SIZE);

    const imageData = ctx.getImageData(
      0,
      0,
      DEFAULT_REDUCED_SIZE,
      DEFAULT_REDUCED_SIZE
    );
    const pixelArray = imageData.data;
    const grayscaleArray = new Uint8Array(
      DEFAULT_REDUCED_SIZE * DEFAULT_REDUCED_SIZE
    );
    for (let i = 0; i < pixelArray.length; i += 4) {
      // rec.601 standard
      // Luminance=0.299×Red+0.587×Green+0.114×Blue
      grayscaleArray[i / 4] = Math.sqrt(
        0.299 * pixelArray[i] * pixelArray[i] +
          0.587 * pixelArray[i + 1] * pixelArray[i + 1] +
          0.114 * pixelArray[i + 2] * pixelArray[i + 2]
      );
    }

    const imageDataMatrix = chunk(grayscaleArray, DEFAULT_REDUCED_SIZE);
    const imageBinMatrix = binarize(cropDct2d(dct2d(imageDataMatrix)));

    const hash = chunk(imageBinMatrix.flat(), BIN_GROUP_SIZE)
      .map((_chunk) => parseInt(_chunk.join(""), 2).toString(16))
      .join("");

    return hash;
  } catch (err) {
    throw new Error(`Error in processing phash, ${(err as Error)?.message}`);
  }
};

export { phash, calcDistance };
