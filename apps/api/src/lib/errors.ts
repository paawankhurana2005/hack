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
