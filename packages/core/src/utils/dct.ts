// For the dct formular, refer to https://en.wikipedia.org/wiki/Discrete_cosine_transform

import { sqrt, sum, cos, pi, round, transpose } from "mathjs";

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

export const dct2d = (matrix: number[][], precision = 8) => {
  // Step 1: Apply 1D DCT on each row
  let rowTransformed = matrix.map((row) => dct1d(row, precision));

  // Step 2: Transpose the matrix to apply DCT on columns
  let transposed = transpose(rowTransformed);

  // Step 3: Apply 1D DCT on each "row" (originally column) of the transposed matrix
  let colTransformed = transposed.map((row) => dct1d(row, precision));

  // Step 4: Transpose back to get the final 2D DCT matrix
  return transpose(colTransformed);
};
