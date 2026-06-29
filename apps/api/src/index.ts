// ReLoop API. Boots Express, mounts CORS + JSON parsing, and wires the sell
// routes to a model-backed grading service plus the return-flow handlers.

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { MOCK_MODE } from './lib/env.js';
import { NvidiaVlmProvider } from './services/grading/nvidia-provider.js';
import { LocalModelProvider } from './services/grading/local-model-provider.js';
import { GradingService } from './services/grading/grading-service.js';
import type { VlmProvider } from './services/grading/types.js';
import { VlmReferenceComparator } from './services/grading/vlm-reference-comparator.js';
import { NvidiaMarketProvider } from './services/pricing/nvidia-market-provider.js';
import { PricingService } from './services/pricing/pricing-service.js';
import { RepriceEngine } from './services/pricing/reprice-engine.js';
import { HeuristicRewardModel, HttpRewardModel } from './services/pricing/reward-model.js';
import { createPricingRouter } from './routes/pricing.js';
import { HealthCardService } from './services/health-card/health-card-service.js';
import { createSellRouter } from './routes/sell.js';
import { createAgentRouter } from './routes/agent.js';
import { createRufusRouter } from './routes/rufus.js';
import { gradeHandler } from './routes/grade.js';
import { routeHandler } from './routes/route.js';
import { healthCardHandler } from './routes/health-card.js';

const app = express();

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mockMode: MOCK_MODE });
});

// GRADER=local routes grading to OUR trained model (ml/grading/serve.py) instead of
// the hosted VLM. Reference comparison stays on the VLM comparator (the local model's
// embedding-diff is exposed via serve.py separately).
const gradingProvider: VlmProvider =
  process.env.GRADER === 'local'
    ? new LocalModelProvider(process.env.LOCAL_GRADER_URL ?? 'http://127.0.0.1:8000')
    : new NvidiaVlmProvider(config);
const gradingService = new GradingService(
  gradingProvider,
  new VlmReferenceComparator(config),
);
const pricingService = new PricingService(new NvidiaMarketProvider(config));
const healthCardService = new HealthCardService();

// Dynamic reprice engine (spec 014). PRICING_MODEL_URL → the trained XGBoost server
// (ml/pricing); unset → the deterministic in-process reward model (runs with no Python).
const pricingModelUrl = process.env.PRICING_MODEL_URL;
const repriceEngine = new RepriceEngine(
  pricingModelUrl ? new HttpRewardModel(pricingModelUrl) : new HeuristicRewardModel(),
  pricingModelUrl ? 'xgboost-http' : 'heuristic-v1',
);

app.use('/api/sell', createSellRouter(gradingService, pricingService, healthCardService));
app.use('/api/pricing', createPricingRouter(repriceEngine));
app.use('/api/agent', createAgentRouter(config));
app.use('/api/rufus', createRufusRouter(config));

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
