export class NvidiaApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`NVIDIA API error ${status}: ${body.slice(0, 200)}`);
    this.name = 'NvidiaApiError';
  }
}

export class GradingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradingServiceError';
  }
}

export class RoutingNarrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingNarrationError';
  }
}

export class HealthCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthCardError';
  }
}

/** Pricing: the requested return record does not exist → maps to HTTP 404. */
export class ReturnNotFoundError extends Error {
  constructor(public readonly returnId: string) {
    super(`Return not found: ${returnId}`);
    this.name = 'ReturnNotFoundError';
  }
}

/** Pricing: the return record is missing fields required to price it → HTTP 400. */
export class ReturnIncompleteError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Return record missing required field(s): ${missing.join(', ')}`);
    this.name = 'ReturnIncompleteError';
  }
}

/** Matching: no match session exists for the given id/return → HTTP 404. */
export class MatchSessionNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Match session not found: ${id}`);
    this.name = 'MatchSessionNotFoundError';
  }
}
