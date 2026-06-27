// A small, real gradient-boosted decision-tree regressor (squared-error boosting
// over shallow CART trees), pure TypeScript and dependency-free. This is the local,
// trained-on-seed stand-in for the production SageMaker LightGBM/XGBoost model — it
// satisfies the same `predict(features) → number` contract, so swapping in the hosted
// model is a one-file change. Training is deterministic (greedy splits, fixed
// hyperparameters), so every prediction and every eval number is reproducible.

export interface GbdtParams {
  rounds: number;
  maxDepth: number;
  learningRate: number;
  minLeaf: number;
}

export const DEFAULT_GBDT_PARAMS: GbdtParams = {
  rounds: 80,
  maxDepth: 3,
  learningRate: 0.1,
  minLeaf: 4,
};

type TreeNode =
  | { kind: 'leaf'; value: number }
  | { kind: 'split'; feature: number; threshold: number; left: TreeNode; right: TreeNode };

export interface GbdtModel {
  base: number;
  learningRate: number;
  trees: TreeNode[];
  predict(x: number[]): number;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sum of squared error of `values` about their own mean. */
function sse(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0);
}

/** Build one regression tree fitting `target` (residuals) over rows `idx`. */
function buildTree(
  X: number[][],
  target: number[],
  idx: number[],
  depth: number,
  params: GbdtParams,
): TreeNode {
  const values = idx.map((i) => target[i]!);
  if (depth === 0 || idx.length < params.minLeaf * 2) {
    return { kind: 'leaf', value: mean(values) };
  }

  const parentSse = sse(values);
  let best: { feature: number; threshold: number; left: number[]; right: number[]; gain: number } | null = null;
  const nFeatures = X[0]?.length ?? 0;

  for (let f = 0; f < nFeatures; f += 1) {
    // Candidate thresholds = midpoints between sorted unique values of this feature.
    const sorted = [...new Set(idx.map((i) => X[i]![f]!))].sort((a, b) => a - b);
    for (let s = 0; s < sorted.length - 1; s += 1) {
      const threshold = (sorted[s]! + sorted[s + 1]!) / 2;
      const left: number[] = [];
      const right: number[] = [];
      for (const i of idx) (X[i]![f]! <= threshold ? left : right).push(i);
      if (left.length < params.minLeaf || right.length < params.minLeaf) continue;
      const gain = parentSse - sse(left.map((i) => target[i]!)) - sse(right.map((i) => target[i]!));
      if (gain > 0 && (best === null || gain > best.gain)) {
        best = { feature: f, threshold, left, right, gain };
      }
    }
  }

  if (best === null) return { kind: 'leaf', value: mean(values) };
  return {
    kind: 'split',
    feature: best.feature,
    threshold: best.threshold,
    left: buildTree(X, target, best.left, depth - 1, params),
    right: buildTree(X, target, best.right, depth - 1, params),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  let cur = node;
  while (cur.kind === 'split') {
    cur = (x[cur.feature] ?? 0) <= cur.threshold ? cur.left : cur.right;
  }
  return cur.value;
}

/** Train a GBDT on (X, y). Deterministic given the same data + params. */
export function trainGbdt(X: number[][], y: number[], params: GbdtParams = DEFAULT_GBDT_PARAMS): GbdtModel {
  const base = mean(y);
  const pred = y.map(() => base);
  const idx = X.map((_, i) => i);
  const trees: TreeNode[] = [];

  for (let r = 0; r < params.rounds; r += 1) {
    const residuals = y.map((yi, i) => yi - pred[i]!);
    const tree = buildTree(X, residuals, idx, params.maxDepth, params);
    trees.push(tree);
    for (let i = 0; i < X.length; i += 1) pred[i]! += params.learningRate * predictTree(tree, X[i]!);
  }

  return {
    base,
    learningRate: params.learningRate,
    trees,
    predict(x: number[]): number {
      return this.base + this.learningRate * this.trees.reduce((s, t) => s + predictTree(t, x), 0);
    },
  };
}
