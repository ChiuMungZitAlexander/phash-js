import sharp from "sharp";
import { dct2d, cropDct2d, binarize } from "@phash-js/core";

type imageType = string | Buffer | ArrayBuffer;

const DEFAULT_REDUCED_SIZE = 32;
const BIN_GROUP_SIZE = 4;

export const phash = async (image: imageType) => {
  try {
    const { data } = await sharp(image)
      .toColorspace("b-w")
      .resize({
        height: DEFAULT_REDUCED_SIZE,
        width: DEFAULT_REDUCED_SIZE,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageDataMatrix: number[][] = [];
    for (let i = 0; i < data.length; i += DEFAULT_REDUCED_SIZE) {
      const row = Array.from(data).slice(i, i + DEFAULT_REDUCED_SIZE);
      imageDataMatrix.push(row);
    }

    const imageBinMatrix = binarize(cropDct2d(dct2d(imageDataMatrix)));
    const imageBinArray = imageBinMatrix.flat();

    let hash = "";
    for (let i = 0; i < imageBinArray.length; i += BIN_GROUP_SIZE) {
      const bin = Number(imageBinArray.slice(i, i + BIN_GROUP_SIZE).join(""));

      if (isNaN(bin)) {
        throw new Error("Image binary group is not a valid number");
      }
      const hex = bin.toString(16);
      hash += hex;
    }

    return hash;
  } catch (err) {
    console.error(err);
  }
};

/**
 * Calculate the hamming distance
 * @param a
 * @param b
 * @returns
 */
export const distance = (a: string, b: string): number => {
  if (a.length !== b.length) {
    throw new Error("Strings must be of the same length");
  }

  let distance = 0;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      distance++;
    }
  }

  return distance;
};
