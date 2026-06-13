// ReLoop API. Boots Express, mounts CORS + JSON parsing, and wires the sell
// routes to a model-backed grading service plus the return-flow handlers.

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { MOCK_MODE } from './lib/env.js';
import { NvidiaVlmProvider } from './services/grading/nvidia-provider.js';
import { GradingService } from './services/grading/grading-service.js';
import { NvidiaMarketProvider } from './services/pricing/nvidia-market-provider.js';
import { PricingService } from './services/pricing/pricing-service.js';
import { HealthCardService } from './services/health-card/health-card-service.js';
import { createSellRouter } from './routes/sell.js';
import { gradeHandler } from './routes/grade.js';
import { routeHandler } from './routes/route.js';
import { healthCardHandler } from './routes/health-card.js';

const app = express();

app.use(cors({ origin: config.WEB_ORIGIN }));
// Base64 images make for large bodies; raise the JSON limit accordingly.
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mockMode: MOCK_MODE });
});

const gradingService = new GradingService(new NvidiaVlmProvider(config));
const pricingService = new PricingService(new NvidiaMarketProvider(config));
const healthCardService = new HealthCardService();
app.use('/api/sell', createSellRouter(gradingService, pricingService, healthCardService));

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
