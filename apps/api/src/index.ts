import express from 'express';
import { env, MOCK_MODE } from './lib/env.js';
import { gradeHandler } from './routes/grade.js';
import { routeHandler } from './routes/route.js';
import { healthCardHandler } from './routes/health-card.js';

const app = express();

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mockMode: MOCK_MODE });
});

app.post('/api/grade', (req, res) => { void gradeHandler(req, res); });
app.post('/api/route', (req, res) => { void routeHandler(req, res); });
app.post('/api/health-card', (req, res) => { void healthCardHandler(req, res); });

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[reloop/api] listening on http://localhost:${env.PORT}`);
  if (MOCK_MODE) {
    // eslint-disable-next-line no-console
    console.warn('[reloop/api] NVIDIA_API_KEY not set — running in mock mode');
  }
});
