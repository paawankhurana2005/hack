// Staged-pipeline engine — "Step Functions, locally". The structural home for the
// inviolable rule: every model call has a deterministic fallback. A pipeline is an
// ordered list of stages; each stage gets a timeout, bounded retries, and a REQUIRED
// deterministic fallback, so a stuck/failed model call degrades to a reproducible
// result instead of failing the whole flow. Pure + dependency-free, so the same
// engine runs identically on client and server (and maps cleanly to AWS Step
// Functions + CloudWatch when hosted).

/** One stage of work. `run` may call a model; `fallback` must not. */
export interface Stage<I, O> {
  name: string;
  /** Hard ceiling for one attempt of `run`, in ms. */
  timeoutMs: number;
  /** Attempts BEYOND the first (0 = try once, no retry). */
  retries: number;
  /** The real, possibly model-backed work. May reject or hang. */
  run(input: I): Promise<O>;
  /** Deterministic fallback used when every `run` attempt fails/times out. */
  fallback(input: I, error: unknown): O;
}

export type StageStatus = 'ok' | 'retried' | 'fallback' | 'error';

/** What happened in one stage — surfaced for explainability / observability. */
export interface StageTrace {
  name: string;
  status: StageStatus;
  /** Total attempts of `run` made (>= 1). */
  attempts: number;
  durationMs: number;
  /** Present when the stage fell back or errored. */
  error?: string;
}

export interface StageOutcome<O> {
  output: O;
  trace: StageTrace;
}

export interface PipelineResult<T> {
  output: T;
  trace: StageTrace[];
  /** True if ANY stage used its fallback. */
  usedFallback: boolean;
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Race a promise against a timeout. Rejects with a clear error past `ms`. */
function withTimeout<O>(p: Promise<O>, ms: number, name: string): Promise<O> {
  return new Promise<O>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`stage "${name}" timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Run one stage: try `run` up to `retries + 1` times under a per-attempt timeout,
 * then fall back deterministically. Never throws — a stage always yields an output.
 */
export async function runStage<I, O>(stage: Stage<I, O>, input: I): Promise<StageOutcome<O>> {
  const started = Date.now();
  const maxAttempts = stage.retries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const output = await withTimeout(stage.run(input), stage.timeoutMs, stage.name);
      return {
        output,
        trace: {
          name: stage.name,
          status: attempt === 1 ? 'ok' : 'retried',
          attempts: attempt,
          durationMs: Date.now() - started,
        },
      };
    } catch (error) {
      lastError = error;
    }
  }

  // Every attempt failed — deterministic fallback keeps the pipeline alive.
  const output = stage.fallback(input, lastError);
  return {
    output,
    trace: {
      name: stage.name,
      status: 'fallback',
      attempts: maxAttempts,
      durationMs: Date.now() - started,
      error: errMessage(lastError),
    },
  };
}

/**
 * Run a 3-stage pipeline, threading each stage's output into the next. Stages are
 * passed as a typed tuple so the input/output chain is checked at compile time. We
 * keep it fixed-arity (the grade→price→card / grade→…→route flows are 2–3 stages)
 * rather than a heterogeneous variadic list, which TypeScript can't type safely.
 */
export async function runPipeline3<A, B, C, D>(
  input: A,
  s1: Stage<A, B>,
  s2: Stage<B, C>,
  s3: Stage<C, D>,
): Promise<PipelineResult<D>> {
  const o1 = await runStage(s1, input);
  const o2 = await runStage(s2, o1.output);
  const o3 = await runStage(s3, o2.output);
  const trace = [o1.trace, o2.trace, o3.trace];
  return {
    output: o3.output,
    trace,
    usedFallback: trace.some((t) => t.status === 'fallback'),
  };
}

/** Two-stage variant (e.g. grade → route). */
export async function runPipeline2<A, B, C>(
  input: A,
  s1: Stage<A, B>,
  s2: Stage<B, C>,
): Promise<PipelineResult<C>> {
  const o1 = await runStage(s1, input);
  const o2 = await runStage(s2, o1.output);
  const trace = [o1.trace, o2.trace];
  return {
    output: o2.output,
    trace,
    usedFallback: trace.some((t) => t.status === 'fallback'),
  };
}
