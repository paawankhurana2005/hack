// ReLoop API. Boots Express, mounts CORS + JSON parsing, and wires the sell
// routes to a model-backed grading service.

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { NvidiaVlmProvider } from './services/grading/nvidia-provider.js';
import { GradingService } from './services/grading/grading-service.js';
import { NvidiaMarketProvider } from './services/pricing/nvidia-market-provider.js';
import { PricingService } from './services/pricing/pricing-service.js';
import { HealthCardService } from './services/health-card/health-card-service.js';
import { createSellRouter } from './routes/sell.js';

const app = express();

app.use(cors({ origin: config.WEB_ORIGIN }));
// Base64 images make for large bodies; raise the JSON limit accordingly.
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const gradingService = new GradingService(new NvidiaVlmProvider(config));
const pricingService = new PricingService(new NvidiaMarketProvider(config));
const healthCardService = new HealthCardService();
app.use('/api/sell', createSellRouter(gradingService, pricingService, healthCardService));

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[reloop/api] listening on http://localhost:${config.PORT}`);
});
