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

const DEFAULT_SAMPLING_SIZE = 8; // The default size for sample the top left values after DCT

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
 * To convert a DCT matrix to only 01 matrix.
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
