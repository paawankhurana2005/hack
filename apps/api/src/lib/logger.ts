// Minimal structured logging + request tracing. Dependency-free: emits one JSON
// line per event so logs are greppable now and ingestible later (CloudWatch,
// Datadog, etc.). Every request gets a request id, echoed back as X-Request-Id.

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

type Level = 'info' | 'warn' | 'error';

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line);
  // eslint-disable-next-line no-console
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

/** Read the request id `requestLogger` attached, for correlating a handler's
 *  own log lines with its access-log entry. */
export function getReqId(req: Request): string | undefined {
  return (req as Request & { reqId?: string }).reqId;
}

/** Express middleware: tag each request with an id and log method/path/status/ms. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const headerId = req.headers['x-request-id'];
  const reqId = (typeof headerId === 'string' && headerId) || randomUUID();
  res.setHeader('X-Request-Id', reqId);
  (req as Request & { reqId?: string }).reqId = reqId;

  const start = Date.now();
  res.on('finish', () => {
    log('info', 'request', {
      reqId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
}
