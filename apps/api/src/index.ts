// ReLoop API. Boots Express, mounts CORS + JSON parsing, and wires the sell
// routes to a model-backed grading service plus the return-flow handlers.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { MOCK_MODE } from './lib/env.js';
import { requestLogger, log } from './lib/logger.js';
import { NvidiaVlmProvider } from './services/grading/nvidia-provider.js';
import { LocalModelProvider } from './services/grading/local-model-provider.js';
import { FallbackVlmProvider } from './services/grading/fallback-provider.js';
import { GradingService } from './services/grading/grading-service.js';
import type { VlmProvider } from './services/grading/types.js';
import { VlmReferenceComparator } from './services/grading/vlm-reference-comparator.js';
import { NvidiaMarketProvider } from './services/pricing/nvidia-market-provider.js';
import { PricingService } from './services/pricing/pricing-service.js';
import { RepriceEngine } from './services/pricing/reprice-engine.js';
import { HeuristicRewardModel, HttpRewardModel } from './services/pricing/reward-model.js';
import type { Completer } from './services/pricing/reprice-narrate.js';
import { nvidiaChat } from './services/nvidia/client.js';
import { createPricingRouter } from './routes/pricing.js';
import { HealthCardService } from './services/health-card/health-card-service.js';
import { createSellRouter } from './routes/sell.js';
import { createAgentRouter } from './routes/agent.js';
import { createRufusRouter } from './routes/rufus.js';
import { createAuthRouter } from './routes/auth.js';
import { createStateRouter } from './routes/state.js';
import { createReturnPricingRouter } from './routes/return-pricing.js';
import { createReturnsRouter } from './routes/returns.js';
import { createMatchingRouter } from './routes/matching.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createListingEventsRouter } from './routes/listing-events.js';
import { createReturnPipelineRouter } from './routes/return-pipeline.js';
import { configureNotificationNarration } from './services/notifications/notification-service.js';
import { isMongoConfigured, getDb } from './lib/mongo.js';
import { ensurePricingIndexes } from './lib/collections.js';
import { scheduleDemandAggregation } from './jobs/computeDemandIndex.js';
import { scheduleMatchingCascade } from './jobs/matchingCascade.js';
import { createGradeHandler } from './routes/grade.js';
import { checkpointHandler, routeHandler } from './routes/route.js';
import { healthCardHandler } from './routes/health-card.js';
import { requireInternalSecret } from './lib/internal-auth.js';

const app = express();

// Behind Render's proxy (and similar) — so the rate limiter sees the real client
// IP, not the proxy's.
app.set('trust proxy', 1);

// Request tracing + structured access logs (assigns X-Request-Id).
app.use(requestLogger);

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

// GRADING_PROVIDER=trained-local routes grading to OUR trained model
// (ml/grading/serve.py) as primary, falling back to the NVIDIA-hosted VLM
// automatically on error/timeout (spec 023). Reference comparison stays on the
// VLM comparator (the local model's embedding-diff is exposed via serve.py
// separately). GRADING_PROVIDER=chat-vlm (Render/prod) skips the trained model
// entirely — no Flask server runs there.
const nvidiaGradingProvider = new NvidiaVlmProvider(config);
const gradingProvider: VlmProvider =
  config.GRADING_PROVIDER === 'trained-local'
    ? new FallbackVlmProvider(new LocalModelProvider(config.GRADING_MODEL_URL), nvidiaGradingProvider)
    : nvidiaGradingProvider;
const gradingService = new GradingService(
  gradingProvider,
  new VlmReferenceComparator(config),
);
const pricingService = new PricingService(new NvidiaMarketProvider(config));
const healthCardService = new HealthCardService();

// Dynamic reprice engine (spec 014). PRICING_MODEL_URL → the trained XGBoost server
// (ml/pricing); unset → the deterministic in-process reward model (runs with no Python).
// The LLM only NARRATES the decision (never changes the price); it's wired only when a key
// is present, and every call falls back to the deterministic template if it errors.
const pricingModelUrl = process.env.PRICING_MODEL_URL;
const narrator: Completer | undefined = MOCK_MODE
  ? undefined
  : {
      complete: (prompt: string) =>
        nvidiaChat(config, {
          model: config.PRICING_MODEL,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 80,
          temperature: 0.3,
        }),
    };
const repriceEngine = new RepriceEngine(
  pricingModelUrl ? new HttpRewardModel(pricingModelUrl) : new HeuristicRewardModel(),
  pricingModelUrl ? 'xgboost-http' : 'heuristic-v1',
  narrator,
);
// Spec 024, phase 4: the same LLM completer (no-op when unset) rephrases
// notification bodies — narration only, never changes which events fire.
configureNotificationNarration(narrator);

app.use('/api/sell', createSellRouter(gradingService, pricingService, healthCardService));
app.use('/api/pricing', createPricingRouter(repriceEngine));
app.use('/api/agent', createAgentRouter(config));
app.use('/api/rufus', createRufusRouter(config));
app.use('/api/auth', createAuthRouter());
app.use('/api/state', createStateRouter());
// Mongo-backed per-return price breakdown (mongodb branch); /api/pricing is the
// spec-014 reprice engine, so this lives at its own path.
app.use('/api/return-pricing', createReturnPricingRouter());
app.use('/api/returns', createReturnsRouter());
app.use('/api/matching', createMatchingRouter());
app.use('/api/notifications', createNotificationsRouter());
app.use('/api/listings', createListingEventsRouter());
// Spec 025 fallback: authenticated AWS SDK calls, standing in for the
// currently account-restricted public Lambda Function URL (see config.ts).
app.use('/api', createReturnPipelineRouter());

// Spec 025: these four routes are the return-worker Lambda's only real
// caller once the async pipeline ships (BuyerStep2Pickup.tsx stops calling
// them directly) — gated behind INTERNAL_API_SECRET when it's configured.
const gradeHandler = createGradeHandler(gradingService);
app.post('/api/grade', requireInternalSecret, (req, res) => { void gradeHandler(req, res); });
app.post('/api/route', requireInternalSecret, (req, res) => { void routeHandler(req, res); });
app.post('/api/return/checkpoint', requireInternalSecret, (req, res) => { void checkpointHandler(req, res); });
app.post('/api/health-card', requireInternalSecret, (req, res) => { void healthCardHandler(req, res); });

app.listen(config.PORT, () => {
  log('info', 'api listening', { port: config.PORT, mockMode: MOCK_MODE });
  if (MOCK_MODE) {
    log('warn', 'NVIDIA_API_KEY not set — running in mock mode');
  }

  // Dynamic pricing: ensure indexes exist and start the hourly demand rollup.
  // Best-effort — failures here must never take the API down.
  if (isMongoConfigured()) {
    getDb()
      .then((db) => ensurePricingIndexes(db))
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : 'unknown error';
        log('error', 'failed to ensure pricing indexes', { detail });
      });
    scheduleDemandAggregation();
    scheduleMatchingCascade();
  }
});
