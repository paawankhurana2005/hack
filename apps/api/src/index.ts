// ReLoop API. Boots Express, mounts CORS + JSON parsing, and wires the sell
// routes to a model-backed grading service plus the return-flow handlers.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { MOCK_MODE } from './lib/env.js';
import { NvidiaVlmProvider } from './services/grading/nvidia-provider.js';
import { GradingService } from './services/grading/grading-service.js';
import { MockReferenceComparator } from './services/grading/mock-reference-comparator.js';
import { NvidiaMarketProvider } from './services/pricing/nvidia-market-provider.js';
import { PricingService } from './services/pricing/pricing-service.js';
import { HealthCardService } from './services/health-card/health-card-service.js';
import { createSellRouter } from './routes/sell.js';
import { createAgentRouter } from './routes/agent.js';
import { createRufusRouter } from './routes/rufus.js';
import { createAuthRouter } from './routes/auth.js';
import { createStateRouter } from './routes/state.js';
import { gradeHandler } from './routes/grade.js';
import { routeHandler } from './routes/route.js';
import { healthCardHandler } from './routes/health-card.js';

const app = express();

// Behind Render's proxy (and similar) — so the rate limiter sees the real client
// IP, not the proxy's.
app.set('trust proxy', 1);

// Security headers. CSP is off (this is a JSON API, not an HTML app) and CORP is
// cross-origin so the browser-side web app can still read responses.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Allow the configured web origin, plus any localhost port in dev (so the web
// dev server's port doesn't have to match WEB_ORIGIN exactly).
app.use(
  cors({
    origin: (origin, cb) => {
      const ok =
        !origin || origin === config.WEB_ORIGIN || /^https?:\/\/localhost:\d+$/.test(origin);
      cb(null, ok);
    },
  }),
);
// Base64 images make for large bodies; raise the JSON limit accordingly.
app.use(express.json({ limit: '20mb' }));

// Generous per-IP rate limit on the API surface — absorbs abuse/runaway clients
// without tripping a normal user (the data sync is debounced to ~1 req/s).
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mockMode: MOCK_MODE });
});

const gradingService = new GradingService(
  new NvidiaVlmProvider(config),
  new MockReferenceComparator(),
);
const pricingService = new PricingService(new NvidiaMarketProvider(config));
const healthCardService = new HealthCardService();
app.use('/api/sell', createSellRouter(gradingService, pricingService, healthCardService));
app.use('/api/agent', createAgentRouter(config));
app.use('/api/rufus', createRufusRouter(config));
app.use('/api/auth', createAuthRouter());
app.use('/api/state', createStateRouter());

app.post('/api/grade', (req, res) => { void gradeHandler(req, res); });
app.post('/api/route', (req, res) => { void routeHandler(req, res); });
app.post('/api/health-card', (req, res) => { void healthCardHandler(req, res); });

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[reloop/api] listening on http://localhost:${config.PORT}`);
  if (MOCK_MODE) {
    // eslint-disable-next-line no-console
    console.warn('[reloop/api] NVIDIA_API_KEY not set — running in mock mode');
  }
});
