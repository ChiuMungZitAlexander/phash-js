import {
  sqrt,
  sum,
  cos,
  pi,
  round,
  transpose,
  subset,
  index,
  range,
  mean,
  min,
  max,
} from "mathjs";

// Before DCT, the image should be reduced in size. Usually 32*32 is an ideal size.
export const DEFAULT_REDUCED_SIZE = 32;

// After DCT and binarization, we will have a long binary string like 0101010111...
// To make it hexadecimal, every 4 digits will be converted.
// For example, 0011110101011111 will be 0011,1101,0101,1111 and then 3d5f
export const BIN_GROUP_SIZE = 4;

// The default size for sample the top left values after DCT.
const DEFAULT_SAMPLING_SIZE = 8;

/**
 * DCT 1d
 * @param sequence
 * @param precision
 * @returns
 */
export const dct1d = (sequence: number[], precision = 8) => {
  const n = sequence.length;

  const result = sequence.map((k, i) => {
    const sigma = sum(
      i === 0
        ? sequence
        : sequence.map((_k, _i) => _k * cos((pi / n) * (_i + 1 / 2) * i))
    );
    const multiplier = sqrt((i === 0 ? 1 : 2) / n) as number;

    return multiplier * sigma;
  });

  return round(result, precision);
};

/**
 * DCT 2d
 * @param matrix
 * @param precision
 * @returns
 */
export const dct2d = (matrix: number[][], precision = 8) => {
  // Step 1: Apply 1D DCT on each row
  const rowTransformed = matrix.map((row) => dct1d(row, precision));

  // Step 2: Transpose the matrix to apply DCT on columns
  const transposed = transpose(rowTransformed);

  // Step 3: Apply 1D DCT on each "row" (originally column) of the transposed matrix
  const colTransformed = transposed.map((row) => dct1d(row, precision));

  // Step 4: Transpose back to get the final 2D DCT matrix
  return transpose(colTransformed);
};

/**
 * Crop DCT matrix.
 * @param matrix
 * @returns
 */
export const cropDct2d = (matrix: number[][], size = DEFAULT_SAMPLING_SIZE) =>
  subset(matrix, index(range(0, size), range(0, size)));

/**
 * To convert a DCT matrix to binary matrix.
 * If element is larger than matrix average, it is 1, otherwise 0.
 * @param matrix
 * @returns
 */
export const binarize = (matrix: number[][]): number[][] => {
  const average = mean(matrix.flat());

  return matrix.map((row) => row.map((value) => (value >= average ? 1 : 0)));
};

/**
 * Occasionally if you want to preview the greyscale image after DCT,
 * as the value can be larger than 255 or negative, normalize the matrix.
 * @param matrix
 * @returns
 */
export const normalize = (matrix: number[][]): number[][] => {
  const minVal = min(matrix.flat());
  const maxVal = max(matrix.flat());

  return matrix.map((row) =>
    row.map((value) => ((value - minVal) / (maxVal - minVal)) * 255)
  );
};

/**
 * Calculate the hamming distance
 * @param a
 * @param b
 * @returns
 */
export const calcDistance = (a: string, b: string): number => {
  if (a.length !== b.length) {
    throw new Error("Strings must be of the same length");
  }

  if (!/^[0-9a-fA-F]+$/.test(`${a}${b}`)) {
    throw new Error("Strings must be hexadecimal");
  }

  const [binA, binB] = [phashToBin(a), phashToBin(b)];

  let distance = 0;

  for (let i = 0; i < binA.length; i++) {
    if (binA[i] !== binB[i]) {
      distance++;
    }
  }

  return distance;
};

/**
 * Convert phash to bin with pad zeros
 * @param phash
 * @returns
 */
function phashToBin(phash: string) {
  return phash
    .split("")
    .map((_hex) =>
      Number(`0x${_hex}`).toString(2).padStart(BIN_GROUP_SIZE, "0")
    )
    .join("");
}
