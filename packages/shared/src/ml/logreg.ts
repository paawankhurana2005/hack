// A small, real logistic-regression classifier (batch gradient descent + L2),
// pure TypeScript and dependency-free. The local trained-on-seed stand-in for the
// production SageMaker / Personalize return-propensity model — same
// `predict(features) → probability` contract. Deterministic training (fixed init +
// fixed iterations), so predictions and eval AUC are reproducible.

export interface LogRegParams {
  epochs: number;
  learningRate: number;
  l2: number;
}

export const DEFAULT_LOGREG_PARAMS: LogRegParams = {
  epochs: 400,
  learningRate: 0.3,
  l2: 1e-3,
};

export interface LogRegModel {
  weights: number[];
  bias: number;
  predict(x: number[]): number; // probability in (0,1)
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Train logistic regression on (X, y∈{0,1}). Deterministic (zero init). */
export function trainLogReg(X: number[][], y: number[], params: LogRegParams = DEFAULT_LOGREG_PARAMS): LogRegModel {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const weights = new Array<number>(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < params.epochs; epoch += 1) {
    const gradW = new Array<number>(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i += 1) {
      const xi = X[i]!;
      let z = bias;
      for (let j = 0; j < d; j += 1) z += weights[j]! * xi[j]!;
      const err = sigmoid(z) - y[i]!;
      for (let j = 0; j < d; j += 1) gradW[j]! += err * xi[j]!;
      gradB += err;
    }
    for (let j = 0; j < d; j += 1) {
      weights[j]! -= params.learningRate * (gradW[j]! / n + params.l2 * weights[j]!);
    }
    bias -= params.learningRate * (gradB / n);
  }

  return {
    weights,
    bias,
    predict(x: number[]): number {
      let z = this.bias;
      for (let j = 0; j < this.weights.length; j += 1) z += this.weights[j]! * (x[j] ?? 0);
      return sigmoid(z);
    },
  };
}

/** Area under the ROC curve for scores vs binary labels (rank-based / Mann-Whitney). */
export function auc(scores: number[], labels: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  scores.forEach((s, i) => (labels[i] === 1 ? pos : neg).push(s));
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) for (const ng of neg) wins += p > ng ? 1 : p === ng ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
