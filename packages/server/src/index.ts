import sharp from "sharp";
import chunk from "lodash/chunk";
import {
  dct2d,
  cropDct2d,
  binarize,
  calcDistance,
  DEFAULT_REDUCED_SIZE,
  BIN_GROUP_SIZE,
} from "@phash-js/core";

type imageType = string | Buffer | ArrayBuffer;

/**
 * @phash-js/server
 * @param image
 * @returns
 */
const phash = async (image: imageType) => {
  try {
    const { data } = await sharp(image)
      .resize({
        height: DEFAULT_REDUCED_SIZE,
        width: DEFAULT_REDUCED_SIZE,
      })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageDataMatrix = chunk(Array.from(data), DEFAULT_REDUCED_SIZE);
    const imageBinMatrix = binarize(cropDct2d(dct2d(imageDataMatrix)));

    const hash = chunk(imageBinMatrix.flat(), BIN_GROUP_SIZE)
      .map((_chunk) => parseInt(_chunk.join(""), 2).toString(16))
      .join("");

    return hash;
  } catch (err) {
    console.error(err);
  }
};

export { phash, calcDistance };
