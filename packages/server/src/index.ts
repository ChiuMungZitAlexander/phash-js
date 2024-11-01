import sharp from "sharp";
import chunk from "lodash/chunk";
import { dct2d, cropDct2d, binarize, calcDistance } from "@phash-js/core";

type imageType = string | Buffer | ArrayBuffer;

const DEFAULT_REDUCED_SIZE = 32;
const BIN_GROUP_SIZE = 4;

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